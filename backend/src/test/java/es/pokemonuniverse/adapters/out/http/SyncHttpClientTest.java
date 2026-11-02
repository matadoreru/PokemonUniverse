package es.pokemonuniverse.adapters.out.http;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.micronaut.json.JsonMapper;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Cliente de sincronización contra un servidor HTTP embebido: reintentos, esperas, límites y cabeceras. */
class SyncHttpClientTest {

  /** Respuesta del servidor para la llamada n (desde 0). */
  @FunctionalInterface
  interface Reply {
    void send(HttpExchange exchange, int call) throws IOException;
  }

  private static final int JITTER = 7;
  private static final long NOW = Instant.parse("2026-11-02T10:00:00Z").toEpochMilli();

  private HttpServer server;
  private final AtomicInteger calls = new AtomicInteger();
  private final List<String> accepts = Collections.synchronizedList(new ArrayList<>());
  private final List<String> agents = Collections.synchronizedList(new ArrayList<>());
  private final List<Long> sleeps = Collections.synchronizedList(new ArrayList<>());
  private final CountDownLatch release = new CountDownLatch(1);
  private volatile Reply reply;

  @BeforeEach
  void start() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
    server.createContext("/", exchange -> {
      var call = calls.getAndIncrement();
      accepts.add(exchange.getRequestHeaders().getFirst("Accept"));
      agents.add(exchange.getRequestHeaders().getFirst("User-Agent"));
      try (exchange) {
        reply.send(exchange, call);
      } catch (IOException ignored) {
        // El cliente cortó la conexión (límite de tamaño o timeout).
      }
    });
    server.start();
  }

  @AfterEach
  void stop() {
    release.countDown();
    server.stop(0);
  }

  private URI uri() {
    return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/resource");
  }

  private SyncHttpClient client(long timeoutMs) {
    var options = new SyncHttpClient.Options(4, 500, timeoutMs, 16L * 1024 * 1024);
    return new SyncHttpClient(JsonMapper.createDefault(), () -> NOW, HttpClient.newHttpClient(), options,
        sleeps::add, () -> JITTER);
  }

  private SyncHttpClient client() {
    return client(5_000);
  }

  private static void send(HttpExchange exchange, int status, String body) throws IOException {
    var bytes = body.getBytes(StandardCharsets.UTF_8);
    exchange.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
    if (bytes.length > 0) exchange.getResponseBody().write(bytes);
  }

  @Test
  void retriesServerErrorsWithExponentialBackoffAndJitter() {
    reply = (exchange, call) -> send(exchange, call < 2 ? 503 : 200, call < 2 ? "busy" : "{\"name\":\"bulbasaur\"}");
    var node = client().json(uri(), "Pokémon");
    assertEquals("bulbasaur", node.get("name").getStringValue());
    assertEquals(3, calls.get());
    assertEquals(List.of(500L + JITTER, 1_000L + JITTER), sleeps);
    assertEquals(List.of("application/json", "application/json", "application/json"), accepts);
    assertEquals("PokemonUniverse-DataSync/1.0", agents.getFirst());
  }

  @Test
  void retryAfterInSecondsOverridesTheBackoffWithASixtySecondCap() {
    reply = (exchange, call) -> {
      if (call == 0) exchange.getResponseHeaders().add("Retry-After", "120");
      send(exchange, call == 0 ? 429 : 200, call == 0 ? "" : "{}");
    };
    client().json(uri(), "Pokémon");
    assertEquals(2, calls.get());
    assertEquals(List.of(60_000L), sleeps);
  }

  @Test
  void retryAfterAsHttpDateIsMeasuredFromTheInjectedClock() {
    var date = DateTimeFormatter.RFC_1123_DATE_TIME.withZone(ZoneOffset.UTC).format(Instant.ofEpochMilli(NOW + 12_000));
    reply = (exchange, call) -> {
      if (call == 0) exchange.getResponseHeaders().add("Retry-After", date);
      send(exchange, call == 0 ? 503 : 200, call == 0 ? "" : "{}");
    };
    client().json(uri(), "Pokémon");
    assertEquals(List.of(12_000L), sleeps);
  }

  @Test
  void otherClientErrorsFailWithoutRetrying() {
    reply = (exchange, call) -> send(exchange, 404, "missing");
    var error = assertThrows(SyncHttpClient.SyncHttpException.class, () -> client().json(uri(), "Pokémon"));
    assertEquals("Pokémon returned HTTP 404", error.getMessage());
    assertEquals(404, error.status());
    assertEquals(1, calls.get());
    assertEquals(List.of(), sleeps);
  }

  @Test
  void persistentServerErrorsFailAfterFourAttemptsWithTheLastStatus() {
    reply = (exchange, call) -> send(exchange, 500, "");
    var error = assertThrows(SyncHttpClient.SyncHttpException.class, () -> client().bytes(uri(), "Sprite"));
    assertEquals("Sprite returned HTTP 500", error.getMessage());
    assertEquals(4, calls.get());
    assertEquals(List.of(500L + JITTER, 1_000L + JITTER, 2_000L + JITTER), sleeps);
  }

  /** Como en Node, el error de tamaño se lanza dentro del intento: se reintenta y al cuarto se propaga. */
  @Test
  void bodiesOverSixteenMebibytesAreCutWhileStreaming() {
    reply = (exchange, call) -> {
      exchange.sendResponseHeaders(200, 0);
      OutputStream body = exchange.getResponseBody();
      var chunk = new byte[64 * 1024];
      for (int written = 0; written < 17 * 1024 * 1024; written += chunk.length) body.write(chunk);
    };
    var error = assertThrows(SyncHttpClient.SyncHttpException.class, () -> client().bytes(uri(), "Sprite"));
    assertEquals("La respuesta supera el límite permitido.", error.getMessage());
    assertEquals(4, calls.get());
  }

  @Test
  void aBodyThatHangsTimesOutAndIsRetried() {
    reply = (exchange, call) -> {
      if (call == 0) {
        exchange.sendResponseHeaders(200, 0);
        exchange.getResponseBody().write(new byte[] {1, 2});
        exchange.getResponseBody().flush();
        try {
          release.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
        }
        return;
      }
      send(exchange, 200, "ok");
    };
    var bytes = client(300).bytes(uri(), "Sprite");
    assertArrayEquals("ok".getBytes(StandardCharsets.UTF_8), bytes);
    assertEquals(2, calls.get());
    assertEquals(List.of(500L + JITTER), sleeps);
    assertEquals("image/*", accepts.getFirst());
  }

  @Test
  void aTimeoutOnEveryAttemptFailsWithTheAbortMessage() {
    reply = (exchange, call) -> {
      try {
        release.await(10, TimeUnit.SECONDS);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
    };
    var error = assertThrows(SyncHttpClient.SyncHttpException.class, () -> client(200).bytes(uri(), "Sprite"));
    assertEquals("The operation was aborted due to timeout", error.getMessage());
    assertEquals(4, calls.get());
  }

  @Test
  void connectionFailuresAreRetriedAsNetworkErrors() {
    server.stop(0);
    var error = assertThrows(SyncHttpClient.SyncHttpException.class, () -> client().bytes(uri(), "Sprite"));
    assertEquals("fetch failed", error.getMessage());
    assertEquals(3, sleeps.size());
  }
}

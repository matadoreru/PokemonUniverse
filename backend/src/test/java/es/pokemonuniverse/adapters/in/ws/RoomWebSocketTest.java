package es.pokemonuniverse.adapters.in.ws;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.rooms.GameCatalogProvider;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import io.micronaut.context.annotation.Primary;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.websocket.CloseReason;
import io.micronaut.websocket.WebSocketClient;
import io.micronaut.websocket.annotation.ClientWebSocket;
import io.micronaut.websocket.annotation.OnClose;
import io.micronaut.websocket.annotation.OnMessage;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.reactivestreams.Publisher;
import org.reactivestreams.Subscriber;
import org.reactivestreams.Subscription;

/** Transporte {@code /ws}: handshake por cookie, sobre {@code {id,event,payload}}, acks, pushes y límites. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "RoomWebSocketTest")
class RoomWebSocketTest {

  private static final Duration WAIT = Duration.ofSeconds(10);
  private static final ObjectMapper JSON = ObjectMapper.getDefault();

  /** El catálogo de la base de datos de Test Resources está vacío: las partidas usan la fixture dorada. */
  @Singleton
  @Primary
  @Requires(property = "spec.name", value = "RoomWebSocketTest")
  static class GoldenCatalogProvider implements GameCatalogProvider {
    @Override
    public PokemonCatalog loadPokemonCatalog() {
      return GoldenCatalogs.load("gen1-2");
    }
  }

  @Inject @Client("/") WebSocketClient client;
  @Inject IdentityTokens tokens;

  private final List<TestSocket> opened = new ArrayList<>();

  @AfterEach
  void closeSockets() {
    for (var socket : opened) closeQuietly(socket);
  }

  @Test
  void closesWith4401WithoutAValidCookie() {
    var anonymous = connect(HttpRequest.GET("/ws"));
    var reason = anonymous.awaitClose();
    assertEquals(4401, reason.getCode());
    assertEquals("Authentication required", reason.getReason());
    assertTrue(anonymous.received.isEmpty());

    var forged = connect(HttpRequest.GET("/ws").cookie(Cookie.of("pu_session", "not-a-token")));
    assertEquals(4401, forged.awaitClose().getCode());
  }

  @Test
  void playsARoomOverTheSocketAndReplacesAnOlderConnection() {
    var host = connect(user("ws_host", "Host"));
    var guest = connect(user("ws_guest", "Guest"));

    var created = host.command("room:create", "{}");
    assertTrue(created.get("ok").getBooleanValue(), created.toString());
    var room = created.get("data").get("room");
    var code = room.get("code").getStringValue();
    assertEquals(6, code.length());
    assertTrue(room.get("game").isNull(), "las claves null de RoomView viajan presentes");

    var joined = guest.command("room:join", "{\"code\":\"" + code + "\"}");
    assertTrue(joined.get("ok").getBooleanValue(), joined.toString());
    assertEquals(code, joined.get("data").get("room").get("code").getStringValue());

    assertOk(guest.command("room:set-ready", "{\"ready\":true}"));
    var selected = host.command("room:select-game", "{\"gameId\":\"higher-lower\"}");
    assertOk(selected);
    assertEquals(Map.of(), asMap(selected.get("data")));
    assertOk(host.command("room:start-game", null));

    var hostState = host.awaitPush("room:state", view -> "ROUND_ACTIVE".equals(text(view, "phase")));
    guest.awaitPush("room:state", view -> "ROUND_ACTIVE".equals(text(view, "phase")));

    var action = "{\"gameInstanceId\":\"" + hostState.get("gameSkipState").get("gameInstanceId").getStringValue()
        + "\",\"actionEpoch\":" + quote(hostState.get("gameActionEpoch").getStringValue())
        + ",\"action\":{\"type\":\"ANSWER\",\"choice\":\"HIGHER\"}}";
    assertOk(host.command("game:action", action));

    // Review Focus 3: una pestaña nueva del mismo usuario reemplaza a la conexión antigua, que sigue abierta.
    var newerHost = connect(user("ws_host", "Host"));
    var restored = newerHost.awaitPush("session:restored", view -> true);
    assertEquals(code, text(restored, "code"));
    var stale = host.command("room:set-ready", "{\"ready\":true}");
    assertError("Esta conexión ha sido reemplazada por una sesión más reciente.", stale);
    assertFalse(host.closed.isDone());

    closeQuietly(guest);
    newerHost.awaitPush("room:state", view -> presenceOf(view, "ws_guest").equals("TEMPORARILY_DISCONNECTED"));

    // Dentro de la gracia, el mismo usuario vuelve con una conexión nueva y recupera su sala.
    var returningGuest = connect(user("ws_guest", "Guest"));
    assertEquals(code, text(returningGuest.awaitPush("session:restored", view -> true), "code"));
    newerHost.awaitPush("room:state", view -> presenceOf(view, "ws_guest").equals("CONNECTED"));
  }

  @Test
  void answersMalformedFramesWithoutClosing() {
    var socket = connect(user("ws_malformed", "Malformed"));
    socket.send("esto no es JSON");
    assertError("Mensaje inválido", socket.awaitIdlessAck());
    socket.send("[1,2,3]");
    assertError("Mensaje inválido", socket.awaitIdlessAck());
    socket.send("{\"id\":\"x1\",\"payload\":{}}");
    assertError("Mensaje inválido", socket.awaitAck("x1"));
    assertError("Evento desconocido", socket.command("room:explode", "{}"));
    assertError("Not in a room", socket.command("room:leave", null));
    assertFalse(socket.closed.isDone());
  }

  @Test
  void closesOversizedFramesWith1009AndKeepsTheRoomAlive() {
    var host = connect(user("ws_big_host", "Host"));
    var guest = connect(user("ws_big_guest", "Guest"));
    var code = host.command("room:create", "{}").get("data").get("room").get("code").getStringValue();
    assertOk(guest.command("room:join", "{\"code\":\"" + code + "\"}"));

    var padding = "x".repeat(40 * 1024);
    guest.send("{\"id\":\"big\",\"event\":\"room:set-ready\",\"payload\":{\"ready\":true,\"pad\":\"" + padding + "\"}}");
    assertEquals(1009, guest.awaitClose().getCode());

    host.awaitPush("room:state", view -> presenceOf(view, "ws_big_guest").equals("TEMPORARILY_DISCONNECTED"));
    assertOk(host.command("room:select-game", "{\"gameId\":\"higher-lower\"}"));
  }

  @Test
  void rateLimitsFiftyCommandsPerTenSecondsExceptCursors() {
    var socket = connect(user("ws_flood", "Flood"));
    for (int i = 0; i < 50; i++) assertError("Not in a room", socket.command("room:leave", null));
    assertError("Rate limit exceeded", socket.command("room:leave", null));
    // Los cursores no cuentan: siguen llegando al coordinador.
    assertError("Not in a room", socket.command("who-is-who:cursor", "{\"x\":0.5,\"y\":0.5}"));
    assertFalse(socket.closed.isDone());
  }

  // ------------------------------------------------------------------------------------------------ utilidades

  private HttpRequest<?> user(String id, String name) {
    var identity = new AuthUser(id, name, AuthUser.Kind.GUEST, null, null, new AvatarRef.Default());
    return HttpRequest.GET("/ws").cookie(Cookie.of("pu_session", tokens.sign(identity, Instant.now())));
  }

  private TestSocket connect(HttpRequest<?> request) {
    var socket = first(client.connect(TestSocket.class, (io.micronaut.http.MutableHttpRequest<?>) request));
    opened.add(socket);
    return socket;
  }

  private static void closeQuietly(TestSocket socket) {
    try {
      socket.close();
    } catch (Exception e) {
      throw new AssertionError(e);
    }
  }

  /** Primer elemento de un {@link Publisher} sin depender de Reactor. */
  private static <T> T first(Publisher<T> publisher) {
    var result = new CompletableFuture<T>();
    publisher.subscribe(new Subscriber<T>() {
      @Override
      public void onSubscribe(Subscription subscription) {
        subscription.request(1);
      }

      @Override
      public void onNext(T value) {
        result.complete(value);
      }

      @Override
      public void onError(Throwable error) {
        result.completeExceptionally(error);
      }

      @Override
      public void onComplete() {
        result.completeExceptionally(new AssertionError("Sin conexión"));
      }
    });
    return result.orTimeout(WAIT.toMillis(), TimeUnit.MILLISECONDS).join();
  }

  private static void assertOk(JsonNode ack) {
    assertTrue(ack.get("ok").getBooleanValue(), ack.toString());
    assertNotNull(ack.get("data"), ack.toString());
  }

  private static void assertError(String message, JsonNode ack) {
    assertFalse(ack.get("ok").getBooleanValue(), ack.toString());
    assertEquals(message, ack.get("error").getStringValue());
    assertTrue(ack.get("data") == null, ack.toString());
  }

  private static String text(JsonNode node, String key) {
    var value = node.get(key);
    return value == null || !value.isString() ? "" : value.getStringValue();
  }

  private static String presenceOf(JsonNode view, String playerId) {
    for (var member : view.get("members").values()) {
      if (playerId.equals(text(member, "id"))) return text(member, "presence");
    }
    return "";
  }

  private static String quote(String value) {
    try {
      return JSON.writeValueAsString(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> asMap(JsonNode node) {
    try {
      return JSON.readValueFromTree(node, Map.class);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Cliente de prueba: separa acks (con {@code ok}) de pushes y recuerda el cierre. */
  @ClientWebSocket("/ws")
  abstract static class TestSocket implements AutoCloseable {

    final List<JsonNode> received = new java.util.concurrent.CopyOnWriteArrayList<>();
    final Map<String, CompletableFuture<JsonNode>> acks = new ConcurrentHashMap<>();
    final BlockingQueue<JsonNode> idlessAcks = new LinkedBlockingQueue<>();
    final BlockingQueue<JsonNode> pushes = new LinkedBlockingQueue<>();
    final CompletableFuture<CloseReason> closed = new CompletableFuture<>();
    private final AtomicInteger ids = new AtomicInteger();

    @OnMessage
    void onMessage(String text) throws IOException {
      var message = JSON.readValue(text, JsonNode.class);
      received.add(message);
      if (message.get("ok") == null) {
        pushes.add(message);
      } else if (message.get("id") == null) {
        idlessAcks.add(message);
      } else {
        acks.computeIfAbsent(message.get("id").getStringValue(), id -> new CompletableFuture<>()).complete(message);
      }
    }

    @OnClose
    void onClose(CloseReason reason) {
      closed.complete(reason);
    }

    abstract void send(String message);

    JsonNode command(String event, String payload) {
      var id = "c" + ids.incrementAndGet();
      send("{\"id\":\"" + id + "\",\"event\":\"" + event + "\"" + (payload == null ? "" : ",\"payload\":" + payload) + "}");
      return awaitAck(id);
    }

    JsonNode awaitAck(String id) {
      return acks.computeIfAbsent(id, key -> new CompletableFuture<>()).orTimeout(WAIT.toMillis(), TimeUnit.MILLISECONDS)
          .join();
    }

    JsonNode awaitIdlessAck() {
      return poll(idlessAcks);
    }

    /** Primer push de {@code event} cuyo payload cumple {@code predicate}; descarta los anteriores. */
    JsonNode awaitPush(String event, Predicate<JsonNode> predicate) {
      long deadline = System.nanoTime() + WAIT.toNanos();
      while (System.nanoTime() < deadline) {
        JsonNode push;
        try {
          push = pushes.poll(deadline - System.nanoTime(), TimeUnit.NANOSECONDS);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          throw new AssertionError(e);
        }
        if (push == null) break;
        if (event.equals(push.get("event").getStringValue()) && predicate.test(push.get("payload"))) {
          return push.get("payload");
        }
      }
      throw new AssertionError("No llegó " + event + "; recibidos: " + received);
    }

    CloseReason awaitClose() {
      return closed.orTimeout(WAIT.toMillis(), TimeUnit.MILLISECONDS).join();
    }

    private static JsonNode poll(BlockingQueue<JsonNode> queue) {
      try {
        var value = queue.poll(WAIT.toMillis(), TimeUnit.MILLISECONDS);
        if (value == null) throw new AssertionError("No llegó el ack");
        return value;
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new AssertionError(e);
      }
    }
  }
}

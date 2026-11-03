package es.pokemonuniverse.application.datasync.tcg;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

/**
 * TCGdex grabado (constraint 6): sirve {@code backend/src/test/resources/datasync/tcgdex/api/} con las rutas de TCGdex
 * ({@code /v2/en/cards/base1-4} → {@code api/v2/en/cards/base1-4.json}). Con {@link #refreshPrices(boolean)} las
 * respuestas de {@code refresh/api/} tienen prioridad (precios nuevos para PRICE_REFRESH). Registra cada ruta pedida.
 */
public final class TcgDexFixtureServer implements AutoCloseable {

  private static final String ROOT = "/datasync/tcgdex";

  private final HttpServer server;
  private final List<String> requests = Collections.synchronizedList(new ArrayList<>());
  private volatile boolean refresh;
  private volatile CountDownLatch gate = new CountDownLatch(0);

  public TcgDexFixtureServer() throws IOException {
    server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
    server.createContext("/", this::handle);
    server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
    server.start();
  }

  public TcgDexUrls urls() {
    return new TcgDexUrls("http://127.0.0.1:" + server.getAddress().getPort() + "/v2/en");
  }

  List<String> requests() {
    synchronized (requests) {
      return List.copyOf(requests);
    }
  }

  void clearRequests() {
    requests.clear();
  }

  void refreshPrices(boolean value) {
    refresh = value;
  }

  /** Retiene cada respuesta hasta que se abra {@code value} (la inicial de TCG queda en curso mientras tanto). */
  public void hold(CountDownLatch value) {
    gate = value;
  }

  private void handle(HttpExchange exchange) throws IOException {
    var path = exchange.getRequestURI().getPath();
    requests.add(exchange.getRequestURI().getRawPath());
    try (exchange) {
      try {
        gate.await();
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        return;
      }
      byte[] body = null;
      for (var prefix : refresh ? List.of("/refresh/api", "/api") : List.of("/api")) {
        try (InputStream in = TcgDexFixtureServer.class.getResourceAsStream(ROOT + prefix + path + ".json")) {
          if (in != null) {
            body = in.readAllBytes();
            break;
          }
        }
      }
      if (body == null) body = "not found".getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set("Content-Type", body.length > 0 && body[0] == 'n' ? "text/plain"
          : "application/json");
      exchange.sendResponseHeaders(body[0] == 'n' ? 404 : 200, body.length);
      exchange.getResponseBody().write(body);
    }
  }

  @Override
  public void close() {
    server.stop(0);
  }
}

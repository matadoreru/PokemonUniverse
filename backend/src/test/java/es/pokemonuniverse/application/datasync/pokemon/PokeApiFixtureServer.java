package es.pokemonuniverse.application.datasync.pokemon;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

/**
 * PokéAPI grabada (constraint 6): sirve {@code backend/src/test/resources/datasync/pokeapi/} con las rutas de PokéAPI
 * ({@code /api/v2/pokemon/74} → {@code api/v2/pokemon/74.json}, {@code ?limit=1} → {@code @limit=1.json}) y de
 * {@code raw.githubusercontent.com} bajo {@code /raw}. Registra cada petición y admite respuestas sustituidas por ruta.
 */
final class PokeApiFixtureServer implements AutoCloseable {

  private static final String ROOT = "/datasync/pokeapi";

  /** Respuesta sustituida para una ruta (con su query). */
  record Canned(int status, byte[] body, String contentType, Map<String, String> headers) {
    static Canned json(String body) {
      return new Canned(200, body.getBytes(StandardCharsets.UTF_8), "application/json", Map.of());
    }

    static Canned status(int status) {
      return new Canned(status, new byte[0], "text/plain", Map.of());
    }

    Canned withHeader(String name, String value) {
      var all = new HashMap<>(headers);
      all.put(name, value);
      return new Canned(status, body, contentType, Map.copyOf(all));
    }
  }

  private final HttpServer server;
  private final List<String> requests = Collections.synchronizedList(new ArrayList<>());
  private final Map<String, Canned> overrides = new ConcurrentHashMap<>();

  PokeApiFixtureServer() throws IOException {
    server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
    server.createContext("/", this::handle);
    server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
    server.start();
  }

  String origin() {
    return "http://127.0.0.1:" + server.getAddress().getPort();
  }

  PokeApiUrls urls() {
    return new PokeApiUrls(origin() + "/api/v2");
  }

  String spriteBase() {
    return origin() + "/raw";
  }

  List<String> requests() {
    synchronized (requests) {
      return List.copyOf(requests);
    }
  }

  void clearRequests() {
    requests.clear();
  }

  void override(String pathAndQuery, Canned response) {
    overrides.put(pathAndQuery, response);
  }

  private void handle(HttpExchange exchange) throws IOException {
    var uri = exchange.getRequestURI();
    var key = uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery());
    requests.add(key);
    try (exchange) {
      var override = overrides.get(key);
      if (override != null) {
        override.headers().forEach((name, value) -> exchange.getResponseHeaders().set(name, value));
        respond(exchange, override.status(), override.body(), override.contentType());
        return;
      }
      var path = uri.getPath().replaceAll("/$", "");
      String resource = null;
      if (path.startsWith("/api/v2/")) {
        resource = ROOT + path + (uri.getRawQuery() == null ? "" : "@" + uri.getRawQuery()) + ".json";
      } else if (path.startsWith("/raw/")) {
        resource = ROOT + path;
      }
      try (InputStream in = resource == null ? null : PokeApiFixtureServer.class.getResourceAsStream(resource)) {
        if (in == null) {
          respond(exchange, 404, "not found".getBytes(StandardCharsets.UTF_8), "text/plain");
          return;
        }
        respond(exchange, 200, in.readAllBytes(), resource.endsWith(".png") ? "image/png" : "application/json");
      }
    }
  }

  private static void respond(HttpExchange exchange, int status, byte[] body, String contentType) throws IOException {
    exchange.getResponseHeaders().set("Content-Type", contentType);
    exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
    if (body.length > 0) exchange.getResponseBody().write(body);
  }

  @Override
  public void close() {
    server.stop(0);
  }
}

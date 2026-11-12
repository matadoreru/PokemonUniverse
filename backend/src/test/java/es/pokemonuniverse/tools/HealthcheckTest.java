package es.pokemonuniverse.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class HealthcheckTest {

  @Test
  void exitsWithZeroWhenReadinessAnswers200() throws Exception {
    var request = new AtomicReference<String>();
    try (var server = respondingWith("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}", request)) {
      var out = new ByteArrayOutputStream();
      assertEquals(0, Healthcheck.run(server.getLocalPort(), new PrintStream(out, true, StandardCharsets.UTF_8)));
      assertEquals("", out.toString(StandardCharsets.UTF_8));
    }
    assertTrue(request.get().startsWith("GET /health/readiness HTTP/1.1\r\n"), request.get());
  }

  @Test
  void exitsWithOneWhenReadinessIsDown() throws Exception {
    try (var server = respondingWith("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n", new AtomicReference<>())) {
      var out = new ByteArrayOutputStream();
      assertEquals(1, Healthcheck.run(server.getLocalPort(), new PrintStream(out, true, StandardCharsets.UTF_8)));
      assertEquals("Healthcheck KO: HTTP/1.1 503 Service Unavailable", out.toString(StandardCharsets.UTF_8).strip());
    }
  }

  @Test
  void exitsWithOneWhenNobodyListens() throws Exception {
    int port;
    try (var free = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
      port = free.getLocalPort();
    }
    var out = new ByteArrayOutputStream();
    assertEquals(1, Healthcheck.run(port, new PrintStream(out, true, StandardCharsets.UTF_8)));
    assertTrue(out.toString(StandardCharsets.UTF_8).startsWith("Healthcheck KO: "));
  }

  @Test
  void portComesFromPortVariableOrDefaultsTo8080() {
    assertEquals(8080, Healthcheck.port(null));
    assertEquals(8080, Healthcheck.port(" "));
    assertEquals(8080, Healthcheck.port("no-es-un-puerto"));
    assertEquals(9090, Healthcheck.port("9090"));
  }

  /** Servidor de un solo uso en loopback: guarda la petición y contesta el texto dado. */
  private static ServerSocket respondingWith(String response, AtomicReference<String> request) throws IOException {
    var server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
    Thread.ofVirtual().start(() -> {
      try (var socket = server.accept()) {
        var received = new StringBuilder();
        var input = socket.getInputStream();
        while (!received.toString().endsWith("\r\n\r\n")) {
          int next = input.read();
          if (next < 0) break;
          received.append((char) next);
        }
        request.set(received.toString());
        socket.getOutputStream().write(response.getBytes(StandardCharsets.US_ASCII));
        socket.getOutputStream().flush();
      } catch (IOException ignored) {
        // El test falla por su propia aserción si el servidor no llegó a contestar.
      }
    });
    return server;
  }
}

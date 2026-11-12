package es.pokemonuniverse.tools;

import java.io.IOException;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Sonda de salud para la imagen nativa, cuya base (UBI-micro) no trae {@code wget} ni {@code curl}: el mismo binario,
 * llamado con {@code --healthcheck}, pide {@code GET /health/readiness} al servidor de este contenedor y sale con 0
 * si responde 200; con 1 en cualquier otro caso. No arranca Micronaut ni abre la BD.
 *
 * <pre>HEALTHCHECK CMD ["/app/backend", "--healthcheck"]</pre>
 *
 * El puerto es el de {@code PORT} (8080 si falta), como {@code micronaut.server.port}.
 */
public final class Healthcheck {

  public static final String FLAG = "--healthcheck";

  static final String PATH = "/health/readiness";
  private static final int TIMEOUT_MS = 3_000;

  private Healthcheck() {}

  public static void main(String[] args) {
    System.exit(run(port(System.getenv("PORT")), System.out));
  }

  static int port(String value) {
    try {
      return value == null || value.isBlank() ? 8080 : Integer.parseInt(value.trim());
    } catch (NumberFormatException e) {
      return 8080;
    }
  }

  /** Código de salida: 0 si la línea de estado es un 200, 1 si no (o si no hay nadie escuchando). */
  static int run(int port, PrintStream out) {
    try (var socket = new Socket()) {
      socket.connect(new InetSocketAddress("127.0.0.1", port), TIMEOUT_MS);
      socket.setSoTimeout(TIMEOUT_MS);
      var request = "GET " + PATH + " HTTP/1.1\r\nHost: 127.0.0.1:" + port + "\r\nConnection: close\r\n\r\n";
      socket.getOutputStream().write(request.getBytes(StandardCharsets.US_ASCII));
      socket.getOutputStream().flush();
      var status = statusLine(socket.getInputStream().readNBytes(64));
      if (status.startsWith("HTTP/1.1 200")) return 0;
      out.println("Healthcheck KO: " + status);
      return 1;
    } catch (IOException | RuntimeException e) {
      out.println("Healthcheck KO: " + e);
      return 1;
    }
  }

  private static String statusLine(byte[] head) {
    var text = new String(head, StandardCharsets.US_ASCII);
    int end = text.indexOf('\r');
    return end < 0 ? text : text.substring(0, end);
  }
}

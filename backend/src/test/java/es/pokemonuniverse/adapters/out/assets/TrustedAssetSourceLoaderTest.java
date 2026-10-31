package es.pokemonuniverse.adapters.out.assets;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TrustedAssetSourceLoaderTest {

  @TempDir Path artworks;
  private HttpServer server;
  private TrustedAssetSourceLoader loader;
  private final AtomicLong written = new AtomicLong();

  @BeforeEach
  void start() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/ok.png", exchange -> {
      exchange.getResponseHeaders().add("Content-Type", "image/gif");
      exchange.sendResponseHeaders(200, 3);
      try (var body = exchange.getResponseBody()) {
        body.write(new byte[] {1, 2, 3});
      }
    });
    server.createContext("/cry.ogg", exchange -> {
      exchange.sendResponseHeaders(200, 2);
      try (var body = exchange.getResponseBody()) {
        body.write(new byte[] {4, 5});
      }
    });
    server.createContext("/missing.png", exchange -> {
      exchange.sendResponseHeaders(404, -1);
      exchange.close();
    });
    server.createContext("/huge.png", exchange -> {
      exchange.sendResponseHeaders(200, 0);
      try (OutputStream body = exchange.getResponseBody()) {
        var chunk = new byte[64 * 1024];
        for (int i = 0; i < 9 * 16; i++) {
          body.write(chunk);
          written.addAndGet(chunk.length);
        }
      } catch (IOException closedByClient) {
        // El cliente corta la descarga al pasar de 8 MiB.
      }
    });
    server.createContext("/stalled.png", exchange -> {
      exchange.sendResponseHeaders(200, 0);
      try (OutputStream body = exchange.getResponseBody()) {
        body.write(new byte[] {1});
        body.flush();
        Thread.sleep(3_000);
      } catch (IOException | InterruptedException ignored) {
        // Fin de la prueba.
      }
    });
    server.start();
    int port = server.getAddress().getPort();
    // Las URL de confianza se validan tal cual y solo después se dirigen al servidor local de la prueba.
    loader = new TrustedAssetSourceLoader(artworks, HttpClient.newHttpClient(),
        uri -> URI.create("http://127.0.0.1:" + port + uri.getRawPath()), Duration.ofMillis(800));
  }

  @AfterEach
  void stop() {
    server.stop(0);
  }

  @Test
  void rejectsUntrustedSources() {
    for (var source : new String[] {"http://raw.githubusercontent.com/a.png", "https://example.com/a.png",
        "local-artwork:../x", "local-artwork:Bulbasaur", "ftp://raw.githubusercontent.com/a.png"}) {
      var error = assertThrows(RuntimeException.class, () -> loader.fetch(source), source);
      assertEquals("Untrusted game image source", error.getMessage(), source);
    }
  }

  @Test
  void fetchesTrustedUrlWithItsContentType() {
    var asset = loader.fetch("https://raw.githubusercontent.com/ok.png");
    assertArrayEquals(new byte[] {1, 2, 3}, asset.body());
    assertEquals("image/gif", asset.contentType());
  }

  @Test
  void defaultsContentTypeToPng() {
    var asset = loader.fetch("https://raw.githubusercontent.com/cry.ogg");
    assertArrayEquals(new byte[] {4, 5}, asset.body());
    // com.sun.net.httpserver no añade Content-Type: se aplica el image/png de Node.
    assertEquals("image/png", asset.contentType());
  }

  @Test
  void reportsUpstreamStatus() {
    var error = assertThrows(RuntimeException.class, () -> loader.fetch("https://raw.githubusercontent.com/missing.png"));
    assertEquals("Sprite source returned 404", error.getMessage());
  }

  @Test
  void stopsReadingPastEightMebibytes() {
    var error = assertThrows(RuntimeException.class, () -> loader.fetch("https://raw.githubusercontent.com/huge.png"));
    assertEquals("La respuesta supera el límite permitido.", error.getMessage());
  }

  @Test
  void timesOutStalledBody() {
    long started = System.nanoTime();
    var error = assertThrows(RuntimeException.class, () -> loader.fetch("https://raw.githubusercontent.com/stalled.png"));
    assertEquals("Sprite source timed out", error.getMessage());
    assertTrue(Duration.ofNanos(System.nanoTime() - started).toMillis() < 2_500);
  }

  @Test
  void readsLocalArtworkFromDirectory() throws IOException {
    Files.write(artworks.resolve("bulbasaur.png"), new byte[] {9, 8, 7});
    var asset = loader.fetch("local-artwork:bulbasaur");
    assertArrayEquals(new byte[] {9, 8, 7}, asset.body());
    assertEquals("image/png", asset.contentType());
  }
}

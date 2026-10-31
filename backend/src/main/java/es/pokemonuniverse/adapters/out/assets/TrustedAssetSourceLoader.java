package es.pokemonuniverse.adapters.out.assets;

import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.domain.game.engine.EngineException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse.BodyHandlers;
import java.net.http.HttpTimeoutException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.UnaryOperator;
import java.util.regex.Pattern;

/**
 * {@code sourceBuffer} de {@code game-image-cache.ts} (constraint 16 de la 2B): solo {@code local-artwork:<id>} dentro
 * del directorio de artworks o {@code https://raw.githubusercontent.com/…}, con 15 s de plazo y 8 MiB de tope.
 */
public class TrustedAssetSourceLoader implements AssetSourceLoader {

  static final Pattern LOCAL_ARTWORK = Pattern.compile("^local-artwork:([a-z0-9]+(?:-[a-z0-9]+)*)$");
  static final long MAX_BYTES = 8L * 1024 * 1024;
  static final Duration TIMEOUT = Duration.ofSeconds(15);
  private static final String TRUSTED_HOST = "raw.githubusercontent.com";
  private static final String DEFAULT_CONTENT_TYPE = "image/png";
  /** Cierra el cuerpo de una descarga atascada: el plazo de {@code HttpRequest} solo cubre las cabeceras. */
  private static final ScheduledExecutorService WATCHDOG = Executors.newSingleThreadScheduledExecutor(
      Thread.ofPlatform().name("asset-download-watchdog").daemon().factory());

  private final Path artworkDir;
  private final HttpClient client;
  private final UnaryOperator<URI> route;
  private final Duration timeout;

  public TrustedAssetSourceLoader(Path artworkDir) {
    this(artworkDir, HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).build(),
        UnaryOperator.identity(), TIMEOUT);
  }

  /** {@code route} solo existe para dirigir las URL ya validadas a un servidor de prueba. */
  TrustedAssetSourceLoader(Path artworkDir, HttpClient client, UnaryOperator<URI> route, Duration timeout) {
    this.artworkDir = artworkDir;
    this.client = client;
    this.route = route;
    this.timeout = timeout;
  }

  /** {@code localArtworkPath}: ruta del PNG local o vacío si la fuente no es {@code local-artwork:<id>} válida. */
  public static Optional<String> localArtworkId(String source) {
    var match = LOCAL_ARTWORK.matcher(source);
    return match.matches() ? Optional.of(match.group(1)) : Optional.empty();
  }

  @Override
  public LoadedAsset fetch(String source) {
    var local = localArtworkId(source);
    if (local.isPresent()) return readLocal(artworkDir.resolve(local.get() + ".png"));
    return download(trustedSpriteUrl(source));
  }

  /** {@code trustedSpriteUrl}: como {@code new URL(...)}, esquema y host se comparan sin distinguir mayúsculas. */
  static URI trustedSpriteUrl(String source) {
    URI uri;
    try {
      uri = new URI(source);
    } catch (Exception e) {
      throw new EngineException("Invalid URL");
    }
    var scheme = uri.getScheme();
    var host = uri.getHost();
    if (scheme == null || host == null || !scheme.toLowerCase(Locale.ROOT).equals("https")
        || !host.toLowerCase(Locale.ROOT).equals(TRUSTED_HOST)) {
      throw new EngineException("Untrusted game image source");
    }
    return uri;
  }

  private static LoadedAsset readLocal(Path path) {
    try {
      return new LoadedAsset(Files.readAllBytes(path), DEFAULT_CONTENT_TYPE);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private LoadedAsset download(URI uri) {
    long deadline = System.nanoTime() + timeout.toNanos();
    var request = HttpRequest.newBuilder(route.apply(uri)).timeout(timeout).GET().build();
    java.net.http.HttpResponse<InputStream> response;
    try {
      response = client.send(request, BodyHandlers.ofInputStream());
    } catch (HttpTimeoutException e) {
      throw new EngineException("Sprite source timed out");
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Descarga interrumpida", e);
    }
    try (var body = response.body()) {
      int status = response.statusCode();
      if (status < 200 || status > 299) throw new EngineException("Sprite source returned " + status);
      var contentType = response.headers().firstValue("content-type").orElse(DEFAULT_CONTENT_TYPE);
      return new LoadedAsset(readLimited(body, deadline), contentType);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** {@code readResponseBytes}: el tope se aplica mientras se lee; {@code Content-Length} no es fiable. */
  private static byte[] readLimited(InputStream body, long deadline) throws IOException {
    var timedOut = new AtomicBoolean();
    var watchdog = WATCHDOG.schedule(() -> {
      timedOut.set(true);
      try {
        body.close();
      } catch (IOException ignored) {
        // El lector verá el cierre o el plazo vencido.
      }
    }, Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
    try {
      var out = new ByteArrayOutputStream();
      var buffer = new byte[64 * 1024];
      long length = 0;
      while (true) {
        int read;
        try {
          read = body.read(buffer);
        } catch (IOException e) {
          if (timedOut.get()) throw new EngineException("Sprite source timed out");
          throw e;
        }
        if (timedOut.get()) throw new EngineException("Sprite source timed out");
        if (read < 0) break;
        length += read;
        if (length > MAX_BYTES) throw new EngineException("La respuesta supera el límite permitido.");
        out.write(buffer, 0, read);
      }
      return out.toByteArray();
    } finally {
      watchdog.cancel(false);
    }
  }
}

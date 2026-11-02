package es.pokemonuniverse.adapters.out.http;

import es.pokemonuniverse.application.time.Clock;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.IntSupplier;

/**
 * Adquisición externa acotada del data-sync ({@code SyncHttpClient} de {@code http-client.ts}); los juegos nunca
 * dependen de ella. Cada intento tiene un plazo total (cabeceras y cuerpo), el cuerpo se lee en streaming y se corta
 * al superar {@code maxBytes}, y se reintenta ante error de red, timeout, 429 y 5xx con espera exponencial más jitter
 * o la indicada por {@code Retry-After} (tope 60 s). Los demás 4xx fallan sin reintento.
 */
@Singleton
public class SyncHttpClient {

  public static final String SIZE_LIMIT = "La respuesta supera el límite permitido.";
  static final String USER_AGENT = "PokemonUniverse-DataSync/1.0";
  /** Mensajes de Node: {@code AbortSignal.timeout} y {@code fetch} ante un fallo de red. */
  static final String TIMEOUT = "The operation was aborted due to timeout";
  static final String NETWORK = "fetch failed";
  private static final long MAX_DELAY_MS = 60_000;

  /** Parámetros del cliente (constraint 5 del plan). */
  public record Options(int attempts, long baseDelayMs, long timeoutMs, long maxBytes) {
    public static final Options DEFAULTS = new Options(4, 500, 30_000, 16L * 1024 * 1024);
  }

  /** Espera entre intentos; inyectada para que las pruebas no duerman. */
  @FunctionalInterface
  public interface Sleeper {
    void sleep(long millis) throws InterruptedException;
  }

  /** Fallo de una petición; {@link #status()} es el código HTTP o 0 si no hubo respuesta válida. */
  public static class SyncHttpException extends RuntimeException {

    private final int status;

    public SyncHttpException(String message) {
      this(message, 0);
    }

    public SyncHttpException(String message, int status) {
      super(message);
      this.status = status;
    }

    public int status() {
      return status;
    }
  }

  private final JsonMapper json;
  private final Clock clock;
  private final HttpClient http;
  private final Options options;
  private final Sleeper sleeper;
  private final IntSupplier jitter;

  @Inject
  public SyncHttpClient(JsonMapper json, Clock clock) {
    this(json, clock, HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).build(), Options.DEFAULTS,
        Thread::sleep, () -> ThreadLocalRandom.current().nextInt(150));
  }

  public SyncHttpClient(JsonMapper json, Clock clock, HttpClient http, Options options, Sleeper sleeper,
      IntSupplier jitter) {
    this.json = json;
    this.clock = clock;
    this.http = http;
    this.options = options;
    this.sleeper = sleeper;
    this.jitter = jitter;
  }

  /** Descarga y parsea JSON; un JSON inválido no se reintenta (en Node {@code JSON.parse} va fuera del bucle). */
  public JsonNode json(URI uri, String label) {
    var body = request(uri, label, "application/json");
    try {
      return json.readValue(body, JsonNode.class);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Descarga binaria (sprites); {@code Accept: image/*} como en Node. */
  public byte[] bytes(URI uri, String label) {
    return request(uri, label, "image/*");
  }

  private byte[] request(URI uri, String label, String accept) {
    SyncHttpException lastError = null;
    for (int attempt = 1; attempt <= options.attempts(); attempt++) {
      long delay = options.baseDelayMs() * (1L << (attempt - 1)) + jitter.getAsInt();
      try {
        var outcome = attempt(uri, accept);
        if (outcome.body() != null) return outcome.body();
        var retryAfter = retryAfterMs(outcome.retryAfter(), clock.now());
        if (retryAfter != null) delay = retryAfter;
        var error = new SyncHttpException(label + " returned HTTP " + outcome.status(), outcome.status());
        if (outcome.status() < 500 && outcome.status() != 429) throw error;
        lastError = error;
      } catch (SyncHttpException e) {
        if (e.status() != 0 && e.status() < 500 && e.status() != 429) throw e;
        lastError = e;
      }
      if (attempt < options.attempts()) {
        try {
          sleeper.sleep(Math.min(delay, MAX_DELAY_MS));
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          throw new SyncHttpException("Could not load " + label);
        }
      }
    }
    throw lastError != null ? lastError : new SyncHttpException("Could not load " + label);
  }

  /** Respuesta de un intento: el cuerpo si fue 2xx; si no, el estado y {@code Retry-After}. */
  private record Outcome(int status, byte @Nullable [] body, @Nullable String retryAfter) {}

  private Outcome attempt(URI uri, String accept) {
    var request = HttpRequest.newBuilder(uri)
        .header("Accept", accept)
        .header("User-Agent", USER_AGENT)
        .timeout(Duration.ofMillis(options.timeoutMs()))
        .GET()
        .build();
    var future = http.sendAsync(request, info -> info.statusCode() >= 200 && info.statusCode() < 300
        ? new CappedBody(options.maxBytes())
        : new CancelledBody());
    try {
      var response = future.get(options.timeoutMs(), TimeUnit.MILLISECONDS);
      return new Outcome(response.statusCode(), response.body(),
          response.headers().firstValue("retry-after").orElse(null));
    } catch (TimeoutException e) {
      future.cancel(true);
      throw new SyncHttpException(TIMEOUT);
    } catch (InterruptedException e) {
      future.cancel(true);
      Thread.currentThread().interrupt();
      throw new SyncHttpException(TIMEOUT);
    } catch (ExecutionException | CancellationException e) {
      throw translate(e);
    }
  }

  private static SyncHttpException translate(Throwable error) {
    for (var cause = error; cause != null; cause = cause.getCause()) {
      if (cause instanceof SyncHttpException known) return known;
      if (cause instanceof java.net.http.HttpTimeoutException) return new SyncHttpException(TIMEOUT);
    }
    return new SyncHttpException(NETWORK);
  }

  /** {@code retryAfterMs}: segundos o fecha HTTP, no negativo, con tope de 60 s; {@code null} si no es válido. */
  static @Nullable Long retryAfterMs(@Nullable String value, long now) {
    if (value == null || value.isBlank()) return null;
    var text = value.strip();
    double delay;
    try {
      delay = Double.parseDouble(text) * 1_000;
    } catch (NumberFormatException notSeconds) {
      try {
        delay = ZonedDateTime.parse(text, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() - now;
      } catch (DateTimeParseException notDate) {
        return null;
      }
    }
    if (!Double.isFinite(delay) || delay < 0) return null;
    return (long) Math.min(delay, MAX_DELAY_MS);
  }

  /** Lee el cuerpo contando bytes; al superar el límite cancela la suscripción y falla con el literal. */
  private static final class CappedBody implements HttpResponse.BodySubscriber<byte[]> {

    private final long maxBytes;
    private final CompletableFuture<byte[]> result = new CompletableFuture<>();
    private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    private long length;
    private Flow.Subscription subscription;

    CappedBody(long maxBytes) {
      this.maxBytes = maxBytes;
    }

    @Override
    public CompletionStage<byte[]> getBody() {
      return result;
    }

    @Override
    public void onSubscribe(Flow.Subscription subscription) {
      this.subscription = subscription;
      subscription.request(Long.MAX_VALUE);
    }

    @Override
    public void onNext(List<ByteBuffer> items) {
      if (result.isDone()) return;
      for (var item : items) {
        length += item.remaining();
        if (length > maxBytes) {
          subscription.cancel();
          result.completeExceptionally(new SyncHttpException(SIZE_LIMIT));
          return;
        }
        var chunk = new byte[item.remaining()];
        item.get(chunk);
        buffer.writeBytes(chunk);
      }
    }

    @Override
    public void onError(Throwable throwable) {
      result.completeExceptionally(throwable);
    }

    @Override
    public void onComplete() {
      result.complete(buffer.toByteArray());
    }
  }

  /** Cuerpo de una respuesta no 2xx: se descarta sin leerlo ({@code response.body?.cancel()}). */
  private static final class CancelledBody implements HttpResponse.BodySubscriber<byte[]> {

    private final CompletableFuture<byte[]> result = new CompletableFuture<>();

    @Override
    public CompletionStage<byte[]> getBody() {
      return result;
    }

    @Override
    public void onSubscribe(Flow.Subscription subscription) {
      subscription.cancel();
      result.complete(null);
    }

    @Override
    public void onNext(List<ByteBuffer> item) {}

    @Override
    public void onError(Throwable throwable) {
      result.complete(null);
    }

    @Override
    public void onComplete() {
      result.complete(null);
    }
  }
}

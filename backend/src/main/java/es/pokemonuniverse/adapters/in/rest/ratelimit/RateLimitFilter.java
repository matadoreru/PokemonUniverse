package es.pokemonuniverse.adapters.in.rest.ratelimit;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.config.PuConfig;
import io.micronaut.context.env.Environment;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.core.annotation.Order;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MutableHttpResponse;
import io.micronaut.http.annotation.RequestFilter;
import io.micronaut.http.annotation.ResponseFilter;
import io.micronaut.http.annotation.ServerFilter;
import java.util.List;

/**
 * Límite de peticiones por IP (global, auth, feedback, avatares) con cabeceras RateLimit-* draft-7. Corre después de
 * {@code IdentityFilter} (orden 0 por defecto): la política de avatares necesita saber si hay cuenta registrada.
 */
@ServerFilter("/api/**")
@Order(100)
public class RateLimitFilter {

  private static final String ATTRIBUTE = "pu.rateLimit";

  private record Entry(RateLimitPolicy policy, FixedWindowCounter counter) {}

  /** Estado de la política más restrictiva para la petición. */
  private record Status(int limit, int remaining, long resetSeconds, boolean exceeded) {}

  private final boolean active;
  private final List<Entry> entries;
  private final Clock clock;

  public RateLimitFilter(PuConfig config, Environment env, Clock clock) {
    this.active = config.rateLimitActive(env);
    this.clock = clock;
    this.entries = RateLimitPolicy.defaults().stream()
        .map(p -> new Entry(p, new FixedWindowCounter(p.window().toSeconds())))
        .toList();
  }

  @RequestFilter
  @Nullable
  public HttpResponse<?> limit(HttpRequest<?> request) {
    String ip = ClientAddress.of(request);
    long now = clock.now() / 1000;
    Status worst = null;
    for (Entry e : entries) {
      if (!active && !e.policy().alwaysActive() || !e.policy().matcher().test(request)) {
        continue;
      }
      var hit = e.counter().hit(ip, now);
      var status = new Status(e.policy().limit(), Math.max(0, e.policy().limit() - hit.count()), hit.resetSeconds(),
          hit.count() > e.policy().limit());
      boolean exceeded = status.exceeded() || (worst != null && worst.exceeded());
      if (worst == null || status.remaining() < worst.remaining()) {
        worst = status;
      }
      if (exceeded && !worst.exceeded()) {
        worst = new Status(worst.limit(), worst.remaining(), worst.resetSeconds(), true);
      }
    }
    if (worst == null) {
      return null;
    }
    request.setAttribute(ATTRIBUTE, worst);
    if (worst.exceeded()) {
      return withHeaders(HttpResponse.status(HttpStatus.TOO_MANY_REQUESTS).body(ApiError.of("Too many requests")), worst);
    }
    return null;
  }

  @ResponseFilter
  public void addHeaders(HttpRequest<?> request, MutableHttpResponse<?> response) {
    request.getAttribute(ATTRIBUTE, Status.class).ifPresent(s -> withHeaders(response, s));
  }

  private static MutableHttpResponse<?> withHeaders(MutableHttpResponse<?> response, Status s) {
    return response
        .header("RateLimit-Limit", Integer.toString(s.limit()))
        .header("RateLimit-Remaining", Integer.toString(s.remaining()))
        .header("RateLimit-Reset", Long.toString(s.resetSeconds()));
  }
}

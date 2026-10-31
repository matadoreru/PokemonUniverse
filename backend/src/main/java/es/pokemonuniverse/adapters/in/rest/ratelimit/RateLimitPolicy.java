package es.pokemonuniverse.adapters.in.rest.ratelimit;

import io.micronaut.http.HttpMethod;
import io.micronaut.http.HttpRequest;
import java.time.Duration;
import java.util.List;
import java.util.function.Predicate;

/** Política de ventana fija por IP: qué peticiones cuenta, cuántas admite y cada cuánto se reinicia. */
record RateLimitPolicy(String name, Predicate<HttpRequest<?>> matcher, int limit, Duration window) {

  static final String AVATARS_PREFIX = "/api/auth/avatars/";

  static List<RateLimitPolicy> defaults() {
    return List.of(
        new RateLimitPolicy("global", r -> r.getPath().startsWith("/api/"), 120, Duration.ofSeconds(60)),
        new RateLimitPolicy("auth",
            r -> r.getPath().startsWith("/api/auth/") && !r.getPath().startsWith(AVATARS_PREFIX),
            30, Duration.ofMinutes(15)),
        new RateLimitPolicy("feedback",
            r -> r.getMethod() == HttpMethod.POST && r.getPath().equals("/api/feedback"),
            10, Duration.ofMinutes(15)));
  }
}

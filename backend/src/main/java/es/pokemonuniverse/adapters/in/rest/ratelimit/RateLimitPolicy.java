package es.pokemonuniverse.adapters.in.rest.ratelimit;

import es.pokemonuniverse.adapters.in.rest.identity.IdentityFilter;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.http.HttpMethod;
import io.micronaut.http.HttpRequest;
import java.time.Duration;
import java.util.List;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Política de ventana fija por IP: qué peticiones cuenta, cuántas admite y cada cuánto se reinicia. Con
 * {@code alwaysActive} cuenta aunque {@code pu.rate-limit-disabled} desactive las demás.
 */
record RateLimitPolicy(String name, Predicate<HttpRequest<?>> matcher, int limit, Duration window, boolean alwaysActive) {

  static final String AVATARS_PREFIX = "/api/auth/avatars/";
  /** Imágenes y gritos de ronda: fuera del límite global, con el suyo ({@code gameImageRateLimit} de Node). */
  static final Pattern GAME_ASSETS = Pattern.compile("^/api/rooms/[^/]+/games/");

  RateLimitPolicy(String name, Predicate<HttpRequest<?>> matcher, int limit, Duration window) {
    this(name, matcher, limit, window, false);
  }

  static List<RateLimitPolicy> defaults() {
    return List.of(
        new RateLimitPolicy("global",
            r -> r.getPath().startsWith("/api/") && !GAME_ASSETS.matcher(r.getPath()).find(),
            120, Duration.ofSeconds(60)),
        new RateLimitPolicy("gameAssets", r -> GAME_ASSETS.matcher(r.getPath()).find(), 5_000, Duration.ofSeconds(60)),
        new RateLimitPolicy("auth",
            r -> r.getPath().startsWith("/api/auth/") && !r.getPath().startsWith(AVATARS_PREFIX),
            30, Duration.ofMinutes(15)),
        new RateLimitPolicy("feedback",
            r -> r.getMethod() == HttpMethod.POST && r.getPath().equals("/api/feedback"),
            10, Duration.ofMinutes(15)),
        // avatarRateLimit de Node: una sola instancia (un contador) para las cuatro rutas de escritura e ignora
        // RATE_LIMIT_DISABLED. En las de perfil va detrás de requireUser, así que un 401 no cuenta.
        new RateLimitPolicy("avatars", RateLimitPolicy::isAvatarWrite, 12, Duration.ofMinutes(15), true));
  }

  static boolean isAvatarWrite(HttpRequest<?> request) {
    var path = request.getPath();
    if (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
    var method = request.getMethod();
    if (method == HttpMethod.POST && path.equals("/api/auth/guest/custom-avatar")) return true;
    boolean profileWrite = method == HttpMethod.PUT && path.equals("/api/auth/profile/avatar/preset")
        || method == HttpMethod.DELETE && path.equals("/api/auth/profile/avatar")
        || method == HttpMethod.PUT && path.equals("/api/auth/profile/avatar/custom");
    return profileWrite && request.getAttribute(IdentityFilter.ATTRIBUTE, AuthUser.class)
        .filter(user -> user.kind() == AuthUser.Kind.USER)
        .isPresent();
  }
}

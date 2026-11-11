package es.pokemonuniverse.adapters.in.rest.identity;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.config.PuConfig;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.http.MutableHttpResponse;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.http.cookie.SameSite;
import jakarta.inject.Singleton;
import java.time.Duration;
import java.time.Instant;

/** Emite y borra la cookie {@code pu_session} con los mismos atributos que el servidor Node. */
@Singleton
public class SessionCookies {

  private static final Duration MAX_AGE = Duration.ofDays(30);

  private final boolean secure;
  private final IdentityTokens tokens;

  public SessionCookies(PuConfig config, IdentityTokens tokens) {
    this.secure = config.auth().cookieSecure();
    this.tokens = tokens;
  }

  /** Firma ahora la sesión de {@code user} y la pone en la cookie de la respuesta. */
  public <B> MutableHttpResponse<B> establishFor(MutableHttpResponse<B> response, AuthUser user) {
    establish(response, tokens.sign(user, Instant.now()));
    return response;
  }

  public void establish(MutableHttpResponse<?> response, String token) {
    response.cookie(base(token).maxAge(MAX_AGE));
  }

  public void clear(MutableHttpResponse<?> response) {
    response.cookie(base("").maxAge(0));
  }

  private Cookie base(String value) {
    return Cookie.of(IdentityFilter.COOKIE_NAME, value)
        .httpOnly(true)
        .secure(secure)
        .sameSite(SameSite.Lax)
        .path("/");
  }
}

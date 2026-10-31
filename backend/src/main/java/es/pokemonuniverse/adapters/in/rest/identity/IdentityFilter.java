package es.pokemonuniverse.adapters.in.rest.identity;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.auth.InvalidTokenException;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.annotation.RequestFilter;
import io.micronaut.http.annotation.ServerFilter;

/** Equivalente a {@code optionalAuth}: una cookie ausente o inválida solo significa petición anónima. */
@ServerFilter("/**")
public class IdentityFilter {

  public static final String COOKIE_NAME = "pu_session";
  public static final String ATTRIBUTE = "pu.identity";

  private final IdentityTokens tokens;

  public IdentityFilter(IdentityTokens tokens) {
    this.tokens = tokens;
  }

  @RequestFilter
  public void identify(HttpRequest<?> request) {
    request.getCookies().findCookie(COOKIE_NAME).ifPresent(cookie -> {
      try {
        request.setAttribute(ATTRIBUTE, tokens.verify(cookie.getValue()));
      } catch (InvalidTokenException ignored) {
        // Cookie inválida: se trata como anónimo.
      }
    });
  }
}

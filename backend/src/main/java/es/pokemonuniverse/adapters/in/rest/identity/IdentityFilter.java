package es.pokemonuniverse.adapters.in.rest.identity;

import es.pokemonuniverse.application.auth.IdentityTokens;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.annotation.RequestFilter;
import io.micronaut.http.annotation.ServerFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Equivalente a {@code optionalAuth}: una cookie ausente o inválida solo significa petición anónima. */
@ServerFilter("/**")
public class IdentityFilter {

  private static final Logger LOG = LoggerFactory.getLogger(IdentityFilter.class);

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
      } catch (RuntimeException e) {
        LOG.debug("Ignoring invalid session cookie: {}", e.toString());
      }
    });
  }
}

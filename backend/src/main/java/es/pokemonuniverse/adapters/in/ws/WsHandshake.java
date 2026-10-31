package es.pokemonuniverse.adapters.in.ws;

import es.pokemonuniverse.adapters.in.rest.identity.IdentityFilter;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.http.HttpRequest;
import jakarta.inject.Singleton;
import java.util.Optional;

/** Identidad del {@code handshake}: la cookie {@code pu_session} verificada, como el middleware de Socket.IO. */
@Singleton
public class WsHandshake {

  private final IdentityTokens tokens;

  public WsHandshake(IdentityTokens tokens) {
    this.tokens = tokens;
  }

  public Optional<AuthUser> identify(HttpRequest<?> request) {
    var cookie = request.getCookies().findCookie(IdentityFilter.COOKIE_NAME);
    if (cookie.isEmpty() || cookie.get().getValue() == null || cookie.get().getValue().isEmpty()) return Optional.empty();
    try {
      return Optional.of(tokens.verify(cookie.get().getValue()));
    } catch (RuntimeException e) {
      // InvalidTokenException y cualquier claim malformado: igual que IdentityFilter, sin identidad.
      return Optional.empty();
    }
  }
}

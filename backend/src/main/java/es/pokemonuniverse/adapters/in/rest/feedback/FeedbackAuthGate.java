package es.pokemonuniverse.adapters.in.rest.feedback;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.identity.IdentityFilter;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.core.annotation.Order;
import io.micronaut.http.HttpMethod;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.RequestFilter;
import io.micronaut.http.annotation.ServerFilter;

/**
 * {@code requireAuth} de la ruta de feedback en Node: {@code POST /api/feedback} exige una sesión (de invitado o de
 * cuenta) antes de leer el cuerpo. Corre después de {@link IdentityFilter} y del limitador (orden 100) y antes de
 * enlazar argumentos, así que un anónimo recibe el 401 aunque el cuerpo esté mal formado.
 */
@ServerFilter(value = "/api/feedback", methods = HttpMethod.POST)
@Order(200)
public class FeedbackAuthGate {

  static final String AUTHENTICATION_REQUIRED = "Authentication required";

  @RequestFilter
  public @Nullable HttpResponse<?> requireSession(HttpRequest<?> request) {
    if (request.getAttribute(IdentityFilter.ATTRIBUTE, AuthUser.class).isPresent()) return null;
    return HttpResponse.status(HttpStatus.UNAUTHORIZED).body(ApiError.of(AUTHENTICATION_REQUIRED));
  }
}

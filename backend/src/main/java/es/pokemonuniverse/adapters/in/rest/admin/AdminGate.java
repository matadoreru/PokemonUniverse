package es.pokemonuniverse.adapters.in.rest.admin;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.identity.IdentityFilter;
import es.pokemonuniverse.application.admin.AdminService;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.core.annotation.Order;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.RequestFilter;
import io.micronaut.http.annotation.ServerFilter;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;

/**
 * {@code router.use(requireAdmin)} de {@code admin/routes.ts}: todo {@code /api/admin/**} (también rutas o métodos
 * que no existen) exige cuenta registrada (401 {@code Registered account required} sin sesión o con invitado) y rol
 * ADMIN leído de la BD en cada petición (403 {@code Administrator access required}, también si la cuenta ya no
 * existe). Corre después de {@link IdentityFilter} y del limitador (orden 100) y antes de enlazar argumentos, así que
 * ninguna validación de query, ruta o cuerpo se adelanta al 401/403.
 */
@ServerFilter("/api/admin/**")
@Order(200)
public class AdminGate {

  static final String REGISTERED_REQUIRED = "Registered account required";
  static final String ADMIN_REQUIRED = "Administrator access required";

  private final AdminService admin;

  public AdminGate(AdminService admin) {
    this.admin = admin;
  }

  @RequestFilter
  @ExecuteOn(TaskExecutors.BLOCKING)
  public @Nullable HttpResponse<?> requireAdmin(HttpRequest<?> request) {
    var user = request.getAttribute(IdentityFilter.ATTRIBUTE, AuthUser.class)
        .filter(identity -> identity.kind() == AuthUser.Kind.USER);
    if (user.isEmpty()) return HttpResponse.status(HttpStatus.UNAUTHORIZED).body(ApiError.of(REGISTERED_REQUIRED));
    if (!admin.isAdmin(user.get().id())) {
      return HttpResponse.status(HttpStatus.FORBIDDEN).body(ApiError.of(ADMIN_REQUIRED));
    }
    return null;
  }
}

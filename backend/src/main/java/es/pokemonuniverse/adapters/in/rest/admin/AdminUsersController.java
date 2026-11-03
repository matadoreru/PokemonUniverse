package es.pokemonuniverse.adapters.in.rest.admin;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ValidationErrorResponse;
import es.pokemonuniverse.application.admin.AdminService;
import es.pokemonuniverse.application.admin.AdminUserItem;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

/** {@code GET /api/admin/users}: cuentas registradas con sus estadísticas. */
@Tag(name = "admin")
@Controller("/api/admin")
@ExecuteOn(TaskExecutors.BLOCKING)
public class AdminUsersController {

  static final List<String> ROLES = List.of("USER", "ADMIN");

  private final AdminService admin;

  public AdminUsersController(AdminService admin) {
    this.admin = admin;
  }

  @Operation(operationId = "adminUsers", summary = "Usuarios registrados", parameters = {
      @Parameter(name = "page", in = ParameterIn.QUERY, description = "Página (entero >= 1, por defecto 1)",
          schema = @Schema(type = "integer", format = "int64", minimum = "1", defaultValue = "1")),
      @Parameter(name = "search", in = ParameterIn.QUERY, description = "Texto recortado de hasta 80 caracteres",
          schema = @Schema(type = "string", maxLength = 80, defaultValue = "")),
      @Parameter(name = "role", in = ParameterIn.QUERY, schema = @Schema(type = "string", allowableValues = {"USER", "ADMIN"}))})
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = UsersPage.class)))
  @ApiResponse(responseCode = "400", description = "Query inválida", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/users")
  public PaginatedResponse<AdminUserItem> users(@Parameter(hidden = true) HttpRequest<?> request) {
    var query = AdminQueryParams.of(request.getParameters().asMap());
    long page = query.page();
    var search = query.search();
    var role = query.enumValue("role", ROLES);
    query.done();
    return PaginatedResponse.of(admin.users(page, search, role));
  }

  /** Solo documenta la página concreta en OpenAPI. */
  @Schema(name = "AdminUsersPage")
  record UsersPage(List<AdminUserItem> items, long page, int pageSize, long total, long totalPages) {}
}

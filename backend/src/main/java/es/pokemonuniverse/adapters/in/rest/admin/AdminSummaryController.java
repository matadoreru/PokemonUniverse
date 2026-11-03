package es.pokemonuniverse.adapters.in.rest.admin;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.application.admin.AdminService;
import es.pokemonuniverse.application.admin.AdminSummary;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

/** {@code GET /api/admin/summary} de {@code admin/routes.ts}; la puerta la aplica {@link AdminGate}. */
@Tag(name = "admin")
@Controller("/api/admin")
@ExecuteOn(TaskExecutors.BLOCKING)
public class AdminSummaryController {

  private final AdminService admin;

  public AdminSummaryController(AdminService admin) {
    this.admin = admin;
  }

  @Operation(operationId = "adminSummary", summary = "Resumen de administración")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = AdminSummary.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/summary")
  public AdminSummary summary() {
    return admin.summary();
  }
}

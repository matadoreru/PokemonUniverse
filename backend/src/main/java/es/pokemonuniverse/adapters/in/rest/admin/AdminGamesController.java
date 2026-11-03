package es.pokemonuniverse.adapters.in.rest.admin;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ValidationErrorResponse;
import es.pokemonuniverse.application.admin.AdminGameHistoryItem;
import es.pokemonuniverse.application.admin.AdminService;
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

/** {@code GET /api/admin/games}: historial de partidas con sus participantes. */
@Tag(name = "admin")
@Controller("/api/admin")
@ExecuteOn(TaskExecutors.BLOCKING)
public class AdminGamesController {

  static final List<String> GAME_STATUSES = List.of("IN_PROGRESS", "COMPLETED", "ABANDONED", "INTERRUPTED");

  private final AdminService admin;

  public AdminGamesController(AdminService admin) {
    this.admin = admin;
  }

  @Operation(operationId = "adminGames", summary = "Historial de partidas", parameters = {
      @Parameter(name = "page", in = ParameterIn.QUERY, description = "Página (entero >= 1, por defecto 1)",
          schema = @Schema(type = "integer", format = "int64", minimum = "1", defaultValue = "1")),
      @Parameter(name = "search", in = ParameterIn.QUERY, description = "Texto recortado de hasta 80 caracteres",
          schema = @Schema(type = "string", maxLength = 80, defaultValue = "")),
      @Parameter(name = "status", in = ParameterIn.QUERY, schema = @Schema(type = "string", allowableValues = {"IN_PROGRESS", "COMPLETED", "ABANDONED", "INTERRUPTED"})),
      @Parameter(name = "gameId", in = ParameterIn.QUERY, description = "Id exacto (recortado, hasta 64 caracteres)", schema = @Schema(type = "string", maxLength = 64))})
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = GamesPage.class)))
  @ApiResponse(responseCode = "400", description = "Query inválida", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/games")
  public PaginatedResponse<AdminGameHistoryItem> games(@Parameter(hidden = true) HttpRequest<?> request) {
    var query = AdminQueryParams.of(request.getParameters().asMap());
    long page = query.page();
    var search = query.search();
    var status = query.enumValue("status", GAME_STATUSES);
    var gameId = query.text("gameId", 64);
    query.done();
    return PaginatedResponse.of(admin.games(page, search, status, gameId));
  }

  /** Solo documenta la página concreta en OpenAPI. */
  @Schema(name = "AdminGamesPage")
  record GamesPage(List<AdminGameHistoryItem> items, long page, int pageSize, long total, long totalPages) {}
}

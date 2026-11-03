package es.pokemonuniverse.adapters.in.rest.admin;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ValidationErrorResponse;
import es.pokemonuniverse.application.admin.AdminRoomHistoryItem;
import es.pokemonuniverse.application.admin.AdminService;
import es.pokemonuniverse.application.rooms.AdminActiveRoom;
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

/** {@code GET /api/admin/active-rooms} (salas vivas del coordinador) y {@code GET /api/admin/rooms} (historial). */
@Tag(name = "admin")
@Controller("/api/admin")
@ExecuteOn(TaskExecutors.BLOCKING)
public class AdminRoomsController {

  static final List<String> ROOM_STATUSES = List.of("ACTIVE", "CLOSED", "INTERRUPTED");

  private final AdminService admin;

  public AdminRoomsController(AdminService admin) {
    this.admin = admin;
  }

  @Operation(operationId = "adminActiveRooms", summary = "Salas activas en memoria", parameters = {
      @Parameter(name = "page", in = ParameterIn.QUERY, description = "Página (entero >= 1, por defecto 1)",
          schema = @Schema(type = "integer", format = "int64", minimum = "1", defaultValue = "1")),
      @Parameter(name = "search", in = ParameterIn.QUERY, description = "Texto recortado de hasta 80 caracteres",
          schema = @Schema(type = "string", maxLength = 80, defaultValue = ""))})
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = ActiveRoomsPage.class)))
  @ApiResponse(responseCode = "400", description = "Query inválida", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/active-rooms")
  public PaginatedResponse<AdminActiveRoom> activeRooms(@Parameter(hidden = true) HttpRequest<?> request) {
    var query = AdminQueryParams.of(request.getParameters().asMap());
    long page = query.page();
    var search = query.search();
    query.done();
    return PaginatedResponse.of(admin.activeRooms(page, search));
  }

  @Operation(operationId = "adminRooms", summary = "Historial de salas", parameters = {
      @Parameter(name = "page", in = ParameterIn.QUERY, description = "Página (entero >= 1, por defecto 1)",
          schema = @Schema(type = "integer", format = "int64", minimum = "1", defaultValue = "1")),
      @Parameter(name = "search", in = ParameterIn.QUERY, description = "Texto recortado de hasta 80 caracteres",
          schema = @Schema(type = "string", maxLength = 80, defaultValue = "")),
      @Parameter(name = "status", in = ParameterIn.QUERY, schema = @Schema(type = "string", allowableValues = {"ACTIVE", "CLOSED", "INTERRUPTED"}))})
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = RoomsPage.class)))
  @ApiResponse(responseCode = "400", description = "Query inválida", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/rooms")
  public PaginatedResponse<AdminRoomHistoryItem> rooms(@Parameter(hidden = true) HttpRequest<?> request) {
    var query = AdminQueryParams.of(request.getParameters().asMap());
    long page = query.page();
    var search = query.search();
    var status = query.enumValue("status", ROOM_STATUSES);
    query.done();
    return PaginatedResponse.of(admin.rooms(page, search, status));
  }

  /** Solo documenta la página concreta en OpenAPI. */
  @Schema(name = "AdminActiveRoomsPage")
  record ActiveRoomsPage(List<AdminActiveRoom> items, long page, int pageSize, long total, long totalPages) {}

  /** Solo documenta la página concreta en OpenAPI. */
  @Schema(name = "AdminRoomsPage")
  record RoomsPage(List<AdminRoomHistoryItem> items, long page, int pageSize, long total, long totalPages) {}
}

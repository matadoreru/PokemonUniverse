package es.pokemonuniverse.adapters.in.rest.admin;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.orEmpty;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ApiException;
import es.pokemonuniverse.adapters.in.rest.ValidationErrorResponse;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncService;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.SyncOverviewItem;
import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.validation.ZodIssues;
import es.pokemonuniverse.config.PuConfig;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.PathVariable;
import io.micronaut.http.annotation.Post;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

/**
 * {@code GET /api/admin/data-sync} y {@code POST /api/admin/data-sync/:source} de {@code admin/routes.ts}. Con
 * {@code pu.data-sync.enabled=false} el bean existe, pero las rutas responden como Node sin servicio: 503 antes de
 * validar el origen o el cuerpo. Orden de Node: puerta, 503, origen ({@code z.enum}, ruta {@code []}), cuerpo, Full
 * Sync sin confirmar (400 solo con {@code error}) y arranque (409 si el origen ya corre). {@code all} traga el
 * conflicto asíncrono de {@code startAll} y responde 202 igualmente; el {@code mode} devuelto es FULL o INCREMENTAL
 * aunque TCG corra como PRICE_REFRESH.
 */
@Tag(name = "admin")
@Controller("/api/admin/data-sync")
@ExecuteOn(TaskExecutors.BLOCKING)
public class AdminDataSyncController {

  static final String UNAVAILABLE = "La sincronización de datos no está disponible";
  static final String FULL_NEEDS_CONFIRMATION = "El Full Sync requiere confirmación explícita";
  private static final List<String> SOURCES = List.of("pokemon", "tcg", "all");

  private final @Nullable DataSyncService dataSync;
  private final boolean enabled;

  public AdminDataSyncController(@Nullable DataSyncService dataSync, PuConfig.DataSync config) {
    this.dataSync = dataSync;
    this.enabled = config.enabled();
  }

  private DataSyncService available() {
    if (!enabled || dataSync == null) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, UNAVAILABLE);
    return dataSync;
  }

  @Operation(operationId = "adminDataSyncOverview", summary = "Estado de la sincronización de datos")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = OverviewResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "503", description = "Data-sync desactivado", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get
  public OverviewResponse overview() {
    return new OverviewResponse(available().overview());
  }

  @Operation(operationId = "adminStartDataSync", summary = "Lanzar una sincronización de datos")
  @RequestBody(content = @Content(schema = @Schema(implementation = StartBody.class)))
  @ApiResponse(responseCode = "202", description = "Aceptada", content = @Content(schema = @Schema(implementation = StartResponse.class)))
  @ApiResponse(responseCode = "400", description = "Origen o cuerpo inválido, o Full Sync sin confirmar", content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "403", description = "Se requiere administrador", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "409", description = "El origen ya se está sincronizando", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "503", description = "Data-sync desactivado", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/{source}")
  public HttpResponse<StartResponse> start(
      @Parameter(schema = @Schema(allowableValues = {"pokemon", "tcg", "all"})) @PathVariable String source,
      @Parameter(hidden = true) @Nullable @Body JsonNode body) {
    var service = available();
    if (!SOURCES.contains(source)) {
      var issues = new ZodIssues();
      issues.invalidValue(SOURCES, List.of());
      throw new InvalidInputException(issues);
    }
    var parsed = StartBody.parse(orEmpty(body));
    if (parsed.full() && !parsed.confirmFull()) throw new ApiException(HttpStatus.BAD_REQUEST, FULL_NEEDS_CONFIRMATION);
    var mode = parsed.full() ? DataSyncMode.FULL : DataSyncMode.INCREMENTAL;
    switch (source) {
      case "all" -> service.startAll(mode).exceptionally(error -> null);
      case "pokemon" -> service.start(DataSyncSource.POKEAPI, mode).exceptionally(error -> null);
      default -> service.start(DataSyncSource.TCGDEX, parsed.full() ? mode : DataSyncMode.PRICE_REFRESH)
          .exceptionally(error -> null);
    }
    return HttpResponse.<StartResponse>status(HttpStatus.ACCEPTED).body(new StartResponse(true, source, mode.name()));
  }

  @Serdeable
  public record OverviewResponse(List<SyncOverviewItem> sources) {}

  @Serdeable
  public record StartResponse(boolean accepted, String source, String mode) {}

  /** {@code z.object({full: z.boolean().default(false), confirmFull: z.boolean().default(false)})}; ignora el resto. */
  @Serdeable
  @Schema(name = "AdminStartDataSyncRequest", description = "Claves desconocidas ignoradas.")
  public record StartBody(
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, defaultValue = "false") boolean full,
      @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, defaultValue = "false") boolean confirmFull) {

    static StartBody parse(JsonNode body) {
      var issues = new ZodIssues();
      if (!body.isObject()) {
        issues.invalidType("object", body, List.of());
        throw new InvalidInputException(issues);
      }
      boolean full = flag(body, "full", issues);
      boolean confirmFull = flag(body, "confirmFull", issues);
      if (!issues.isEmpty()) throw new InvalidInputException(issues);
      return new StartBody(full, confirmFull);
    }

    private static boolean flag(JsonNode body, String key, ZodIssues issues) {
      var value = body.get(key);
      if (value == null) return false;
      if (!value.isBoolean()) {
        issues.invalidType("boolean", value, List.of(key));
        return false;
      }
      return value.getBooleanValue();
    }
  }
}

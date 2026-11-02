package es.pokemonuniverse.adapters.in.rest.tcg;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.orEmpty;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.ValidationErrorResponse;
import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import es.pokemonuniverse.application.tcg.TcgEligibility;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Post;
import io.micronaut.http.annotation.Status;
import io.micronaut.http.HttpStatus;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

/**
 * {@code GET /api/tcg/options} y {@code POST /api/tcg/eligibility} de {@code apps/server/src/http/routes.ts}: sin
 * autenticación. Sin catálogo cargado Node lanza un {@code Error} plano (500 con su mensaje fuera de producción);
 * aquí, una {@link IllegalStateException} con el mismo literal que responde el manejador genérico.
 */
@Tag(name = "tcg")
@Controller("/api/tcg")
@ExecuteOn(TaskExecutors.BLOCKING)
public class TcgController {

  static final String NOT_READY = "El catálogo TCG todavía no está disponible.";

  private final @Nullable CachedTcgCardCatalog catalog;

  public TcgController(@Nullable CachedTcgCardCatalog catalog) {
    this.catalog = catalog;
  }

  private CachedTcgCardCatalog loaded() {
    if (catalog == null || !catalog.loaded()) throw new IllegalStateException(NOT_READY);
    return catalog;
  }

  @Operation(operationId = "tcgOptions", summary = "Opciones de filtro del catálogo TCG")
  @ApiResponse(responseCode = "200", description = "OK",
      content = @Content(schema = @Schema(implementation = TcgCardCatalog.FilterOptions.class)))
  @ApiResponse(responseCode = "500", description = "Catálogo todavía no disponible",
      content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get("/options")
  public TcgCardCatalog.FilterOptions options() {
    return loaded().options();
  }

  @Operation(operationId = "tcgEligibility", summary = "Cartas TCG que cumplen una configuración de Higher or Lower: Cartas")
  @RequestBody(content = @Content(schema = @Schema(implementation = EligibilityBody.class)))
  @ApiResponse(responseCode = "200", description = "OK",
      content = @Content(schema = @Schema(implementation = EligibilityResponse.class)))
  @ApiResponse(responseCode = "400", description = "Configuración inválida",
      content = @Content(schema = @Schema(implementation = ValidationErrorResponse.class)))
  @ApiResponse(responseCode = "500", description = "Catálogo todavía no disponible o precio no canónico",
      content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/eligibility")
  @Status(HttpStatus.OK)
  public EligibilityResponse eligibility(@Parameter(hidden = true) @Nullable @Body JsonNode body) {
    var current = loaded();
    return new EligibilityResponse(current.cardsFor(TcgEligibility.parse(orEmpty(body))).size());
  }

  /** {@code {cardCount}}: cartas de {@code cardsFor(config)}. */
  @Serdeable
  public record EligibilityResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int cardCount) {}

  /** Solo documenta el cuerpo: la configuración completa de {@code tcgHigherLowerConfigSchema}. */
  @Serdeable
  @Schema(name = "TcgHigherLowerConfigBody", description = "Configuración completa de Higher or Lower: Cartas; las"
      + " claves desconocidas se ignoran.")
  public record EligibilityBody(
      @ArraySchema(schema = @Schema(minimum = "1", maximum = "9"), minItems = 1,
          arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED)) List<Integer> generations,
      @ArraySchema(schema = @Schema(minLength = 1),
          arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED)) List<String> setIds,
      @ArraySchema(schema = @Schema(minLength = 1),
          arraySchema = @Schema(requiredMode = Schema.RequiredMode.REQUIRED)) List<String> rarities,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, pattern = "^\\d+(?:\\.\\d+)?$")
      @Nullable String minPrice,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, pattern = "^\\d+(?:\\.\\d+)?$")
      @Nullable String maxPrice,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean showRarity,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "5", maximum = "50") int rounds,
      @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minimum = "5", maximum = "60") int roundSeconds) {}
}

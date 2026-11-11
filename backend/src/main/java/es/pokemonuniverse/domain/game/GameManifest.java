package es.pokemonuniverse.domain.game;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;

/**
 * Manifiesto de un minijuego mas su configuracion por defecto, tal como lo exporta el registro TypeScript. Los
 * nulos no salen en el JSON, así que el OpenAPI marca esos campos como opcionales y no anulables.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GameManifest(
    String id,
    String name,
    String icon,
    String description,
    /** «Cómo se juega»: tres frases cortas (qué hacer, cómo se puntúa y un consejo), en la intro y en la ayuda. */
    List<String> howTo,
    @Nullable @Schema(nullable = false) Boolean experimental,
    @Nullable @Schema(nullable = false) Boolean recommended,
    int minPlayers,
    @Nullable @Schema(nullable = false) Integer maxPlayers,
    /** Ms durante los que una desconexión no llega al motor; nunca alarga un plazo. */
    @Nullable @Schema(nullable = false) Integer presenceGraceMs,
    ProfileStatsDefinition profileStats,
    Map<String, Object> defaultConfig) {

  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record ProfileStatsDefinition(
      List<MetricDefinition> metrics,
      @Nullable @Schema(nullable = false) List<DerivedMetricDefinition> derivedMetrics) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record MetricDefinition(
      String key,
      String label,
      @Schema(type = "string", allowableValues = {"SUM", "MAX", "MIN"}, requiredMode = Schema.RequiredMode.REQUIRED)
      String aggregation,
      @Nullable @Schema(type = "string", nullable = false, allowableValues = {"NUMBER", "DURATION_MS"})
      String format) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record DerivedMetricDefinition(
      String key,
      String label,
      @Schema(type = "string", allowableValues = {"PERCENT", "AVERAGE"}, requiredMode = Schema.RequiredMode.REQUIRED)
      String kind,
      String numerator,
      List<String> denominator,
      @Nullable @Schema(type = "string", nullable = false, allowableValues = {"NUMBER", "DURATION_MS"})
      String format) {}
}

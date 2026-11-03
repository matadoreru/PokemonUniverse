package es.pokemonuniverse.domain.game;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;

/** Manifiesto de un minijuego mas su configuracion por defecto, tal como lo exporta el registro TypeScript. */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GameManifest(
    String id,
    String name,
    String icon,
    String description,
    @Nullable Boolean experimental,
    @Nullable Boolean recommended,
    int minPlayers,
    @Nullable Integer maxPlayers,
    /** Ms durante los que una desconexión no llega al motor; nunca alarga un plazo. */
    @Nullable Integer presenceGraceMs,
    ProfileStatsDefinition profileStats,
    Map<String, Object> defaultConfig) {

  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record ProfileStatsDefinition(
      List<MetricDefinition> metrics, @Nullable List<DerivedMetricDefinition> derivedMetrics) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record MetricDefinition(String key, String label, String aggregation, @Nullable String format) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record DerivedMetricDefinition(
      String key, String label, String kind, String numerator, List<String> denominator, @Nullable String format) {}
}

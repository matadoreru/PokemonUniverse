package es.pokemonuniverse.domain.game.engines.sketchmon;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code sketchmonConfigSchema} de {@code sketchmon/config.ts}). El esquema es
 * {@code .strict()}: una clave desconocida invalida la configuración. Los componentes siguen el orden de claves del
 * esquema Zod.
 */
@Serdeable
public record SketchmonConfig(
    List<Integer> generations,
    int roundSeconds,
    int laps,
    boolean hintsEnabled,
    boolean memoryPreviewEnabled,
    boolean includeForms) {

  /** {@code sketchmonRoundSeconds}. */
  static final List<Integer> ROUND_SECONDS = List.of(60, 90, 120);

  private static final Set<String> KEYS =
      Set.of("generations", "roundSeconds", "laps", "hintsEnabled", "memoryPreviewEnabled", "includeForms");

  public SketchmonConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultSketchmonConfig}. */
  public static SketchmonConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return builder().generations(generations).roundSeconds(90).laps(1).hintsEnabled(false)
        .memoryPreviewEnabled(false).includeForms(false).build();
  }

  public static Builder builder() {
    return new Builder();
  }

  /** Tres booleanos contiguos: setters con nombre. */
  public static final class Builder {
    private List<Integer> generations = List.of();
    private int roundSeconds;
    private int laps;
    private boolean hintsEnabled;
    private boolean memoryPreviewEnabled;
    private boolean includeForms;

    private Builder() {}

    public Builder generations(List<Integer> value) { generations = value; return this; }

    public Builder roundSeconds(int value) { roundSeconds = value; return this; }

    public Builder laps(int value) { laps = value; return this; }

    public Builder hintsEnabled(boolean value) { hintsEnabled = value; return this; }

    public Builder memoryPreviewEnabled(boolean value) { memoryPreviewEnabled = value; return this; }

    public Builder includeForms(boolean value) { includeForms = value; return this; }

    public SketchmonConfig build() {
      return new SketchmonConfig(generations, roundSeconds, laps, hintsEnabled, memoryPreviewEnabled, includeForms);
    }
  }

  /**
   * {@code sketchmonConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes
   * ({@code pokemonGenerationsSchema}); {@code roundSeconds} es un entero seguro de la lista 60, 90 o 120. Los enteros
   * admiten {@code 90.0} (JS tiene un único tipo numérico) y rechazan {@code 90.5}.
   */
  public static SketchmonConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Sketchmon");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int roundSeconds = config.option("roundSeconds", ROUND_SECONDS, "El tiempo debe ser 60, 90 o 120 segundos");
    int laps = config.integer("laps", 1, 3);
    return builder().generations(generations).roundSeconds(roundSeconds).laps(laps)
        .hintsEnabled(config.bool("hintsEnabled")).memoryPreviewEnabled(config.bool("memoryPreviewEnabled"))
        .includeForms(config.bool("includeForms")).build();
  }
}

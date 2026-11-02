package es.pokemonuniverse.domain.game.engines.sketchmon;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.json.JsNumbers;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

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

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;
  /** {@code sketchmonRoundSeconds}. */
  static final List<Integer> ROUND_SECONDS = List.of(60, 90, 120);

  private static final Set<String> KEYS =
      Set.of("generations", "roundSeconds", "laps", "hintsEnabled", "memoryPreviewEnabled", "includeForms");

  public SketchmonConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultSketchmonConfig}. */
  public static SketchmonConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
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
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    for (var entry : raw.entries()) {
      if (!KEYS.contains(entry.getKey())) throw invalid("clave desconocida " + entry.getKey());
    }
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    double seconds = safeInteger(required(raw, "roundSeconds"), "roundSeconds");
    if (ROUND_SECONDS.stream().noneMatch(allowed -> allowed == seconds)) {
      throw invalid("El tiempo debe ser 60, 90 o 120 segundos");
    }
    int roundSeconds = (int) seconds;
    int laps = integer(required(raw, "laps"), "laps", 1, 3);
    return builder().generations(new ArrayList<>(generations)).roundSeconds(roundSeconds).laps(laps)
        .hintsEnabled(flag(raw, "hintsEnabled")).memoryPreviewEnabled(flag(raw, "memoryPreviewEnabled"))
        .includeForms(flag(raw, "includeForms")).build();
  }

  private static JsonNode required(JsonNode raw, String key) {
    var value = raw.get(key);
    if (value == null) throw invalid("falta " + key);
    return value;
  }

  private static boolean flag(JsonNode raw, String key) {
    var value = required(raw, key);
    if (!value.isBoolean()) throw invalid(key + " debe ser booleano");
    return value.getBooleanValue();
  }

  /** {@code z.number().int().min(min).max(max)}; {@code .int()} es {@code Number.isSafeInteger} en Zod 4. */
  private static int integer(JsonNode value, String key, int min, int max) {
    double number = safeInteger(value, key);
    if (number < min || number > max) throw invalid(key + " debe estar entre " + min + " y " + max);
    return (int) number;
  }

  /** {@code z.number().int()}: número y entero seguro. */
  private static double safeInteger(JsonNode value, String key) {
    if (!value.isNumber()) throw invalid(key + " debe ser un número entero");
    double number = value.getDoubleValue();
    if (!JsNumbers.isSafeInteger(number)) throw invalid(key + " debe ser un número entero");
    return number;
  }

  private static ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de Sketchmon no válida: " + detail + ".");
  }
}

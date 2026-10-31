package es.pokemonuniverse.domain.game.engines.shinyvote;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code shinyVoteConfigSchema} de {@code shiny-vote/config.ts}). El esquema <b>no</b> es
 * {@code .strict()}: las claves desconocidas se descartan y la configuración sigue siendo válida.
 */
@Serdeable
public record ShinyVoteConfig(
    List<Integer> generations,
    int roundSeconds,
    int rounds,
    CandidateMode candidateMode,
    int optionCount,
    boolean showVotes) {

  /** {@code SHINY_CANDIDATE_MODES}. */
  public enum CandidateMode { SAME_POKEMON, DIFFERENT_POKEMON }

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  public ShinyVoteConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultShinyVoteConfig}. */
  public static ShinyVoteConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new ShinyVoteConfig(generations, 20, 10, CandidateMode.SAME_POKEMON, 4, true);
  }

  /**
   * {@code shinyVoteConfigSchema.parse}: {@code generations} sin duplicados y ascendentes
   * ({@code pokemonGenerationsSchema}); {@code candidateMode} distingue mayúsculas. Los enteros admiten {@code 10.0} y
   * rechazan {@code 10.5}.
   */
  public static ShinyVoteConfig parse(JsonNode raw) {
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", 10, 60);
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 50);
    var candidateMode = candidateMode(required(raw, "candidateMode"));
    int optionCount = integer(required(raw, "optionCount"), "optionCount", 3, 6);
    boolean showVotes = flag(raw, "showVotes");
    return new ShinyVoteConfig(new ArrayList<>(generations), roundSeconds, rounds, candidateMode, optionCount,
        showVotes);
  }

  private static CandidateMode candidateMode(JsonNode value) {
    if (value.isString()) {
      for (var mode : CandidateMode.values()) {
        if (mode.name().equals(value.getStringValue())) return mode;
      }
    }
    throw invalid("candidateMode debe ser SAME_POKEMON o DIFFERENT_POKEMON");
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

  /** {@code z.number().int().min(min).max(max)}. */
  private static int integer(JsonNode value, String key, int min, int max) {
    if (!value.isNumber()) throw invalid(key + " debe ser un número entero");
    double number = value.getDoubleValue();
    if (number != Math.rint(number) || Double.isInfinite(number)) throw invalid(key + " debe ser un número entero");
    if (number < min || number > max) throw invalid(key + " debe estar entre " + min + " y " + max);
    return (int) number;
  }

  private static ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de Shiny Quiz no válida: " + detail + ".");
  }
}

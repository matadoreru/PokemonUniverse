package es.pokemonuniverse.domain.game.engines.oneofusisfake;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/** Configuración normalizada ({@code oneOfUsIsFakeConfigSchema} de {@code one-of-us-is-fake/config.ts}); estricta. */
@Serdeable
public record OneOfUsIsFakeConfig(List<Integer> generations, int selectionSeconds, int discussionSeconds, int rounds,
    boolean fakeKnows, CategorySource categorySource, boolean includeRegionalForms) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS = Set.of("generations", "selectionSeconds", "discussionSeconds", "rounds",
      "fakeKnows", "categorySource", "includeRegionalForms");

  public OneOfUsIsFakeConfig {
    generations = List.copyOf(generations);
  }

  /** {@code categorySourceSchema}: el {@code subjectivePromptSourceSchema} de {@code games/config.ts}. */
  public enum CategorySource { OFFICIAL, CUSTOM, BOTH }

  /** {@code defaultOneOfUsIsFakeConfig}. */
  public static OneOfUsIsFakeConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new OneOfUsIsFakeConfig(generations, 30, 180, 5, false, CategorySource.OFFICIAL, true);
  }

  /**
   * {@code oneOfUsIsFakeConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes. Los
   * enteros admiten {@code 3.0} (JS tiene un único tipo numérico) y rechazan {@code 3.5}.
   */
  public static OneOfUsIsFakeConfig parse(JsonNode raw) {
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
    int selectionSeconds = integer(required(raw, "selectionSeconds"), "selectionSeconds", 15, 120);
    int discussionSeconds = integer(required(raw, "discussionSeconds"), "discussionSeconds", 30, 600);
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 30);
    boolean fakeKnows = bool(required(raw, "fakeKnows"), "fakeKnows");
    var categorySource = categorySource(required(raw, "categorySource"));
    boolean includeRegionalForms = bool(required(raw, "includeRegionalForms"), "includeRegionalForms");
    return new OneOfUsIsFakeConfig(new ArrayList<>(generations), selectionSeconds, discussionSeconds, rounds, fakeKnows,
        categorySource, includeRegionalForms);
  }

  private static CategorySource categorySource(JsonNode value) {
    if (value.isString()) {
      for (var constant : CategorySource.values()) {
        if (constant.name().equals(value.getStringValue())) return constant;
      }
    }
    throw invalid("categorySource tiene un valor no válido");
  }

  private static boolean bool(JsonNode value, String key) {
    if (!value.isBoolean()) throw invalid(key + " debe ser booleano");
    return value.getBooleanValue();
  }

  private static JsonNode required(JsonNode raw, String key) {
    var value = raw.get(key);
    if (value == null) throw invalid("falta " + key);
    return value;
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
    return new ConfigValidationException("Configuración de One of Us Is Fake no válida: " + detail + ".");
  }
}

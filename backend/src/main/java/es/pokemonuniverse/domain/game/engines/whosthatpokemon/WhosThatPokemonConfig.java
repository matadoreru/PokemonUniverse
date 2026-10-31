package es.pokemonuniverse.domain.game.engines.whosthatpokemon;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code whosThatPokemonConfigSchema} de {@code whos-that-pokemon/config.ts}). El esquema
 * es {@code .strict()}: una clave desconocida invalida la configuración.
 */
@Serdeable
public record WhosThatPokemonConfig(
    List<Integer> generations,
    int roundSeconds,
    int rounds,
    boolean hintsEnabled,
    boolean includeRegionalForms) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS =
      Set.of("generations", "roundSeconds", "rounds", "hintsEnabled", "includeRegionalForms");

  public WhosThatPokemonConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultWhosThatPokemonConfig}. */
  public static WhosThatPokemonConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new WhosThatPokemonConfig(generations, 20, 10, false, true);
  }

  /**
   * {@code whosThatPokemonConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes
   * ({@code pokemonGenerationsSchema}). Los enteros admiten {@code 10.0} y rechazan {@code 10.5}.
   */
  public static WhosThatPokemonConfig parse(JsonNode raw) {
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
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", 10, 60);
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 20);
    boolean hintsEnabled = flag(raw, "hintsEnabled");
    boolean includeRegionalForms = flag(raw, "includeRegionalForms");
    return new WhosThatPokemonConfig(new ArrayList<>(generations), roundSeconds, rounds, hintsEnabled,
        includeRegionalForms);
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
    return new ConfigValidationException("Configuración de ¿Quién es ese Pokémon? no válida: " + detail + ".");
  }
}

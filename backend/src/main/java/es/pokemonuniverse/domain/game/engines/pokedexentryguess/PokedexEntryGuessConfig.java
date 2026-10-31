package es.pokemonuniverse.domain.game.engines.pokedexentryguess;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code pokedexEntryGuessConfigSchema} de {@code pokedex-entry-guess/config.ts}). El
 * esquema es {@code .strict()} en la raíz y en {@code hints}: una clave desconocida en cualquiera de los dos invalida la
 * configuración.
 */
@Serdeable
public record PokedexEntryGuessConfig(
    List<Integer> generations,
    int roundSeconds,
    int rounds,
    boolean hintsEnabled,
    PokedexEntryHintConfig hints) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS = Set.of("generations", "roundSeconds", "rounds", "hintsEnabled", "hints");

  public PokedexEntryGuessConfig {
    generations = List.copyOf(generations);
  }

  /** {@code pokedexEntryHintConfigSchema}: pistas adicionales (claves de TS, en su orden). */
  @Serdeable
  public record PokedexEntryHintConfig(boolean generation, boolean type, boolean evolution, boolean typeCount,
      boolean category) {

    static final Set<String> KEYS = Set.of("generation", "type", "evolution", "typeCount", "category");

    /** {@code Object.values(value.hints).some(Boolean)}. */
    boolean any() {
      return generation || type || evolution || typeCount || category;
    }

    /** Cada argumento se lee por su clave literal; el orden posicional es el del esquema. */
    static PokedexEntryHintConfig parse(JsonNode raw) {
      strict(raw, KEYS, "hints");
      return new PokedexEntryHintConfig(flag(raw, "generation"), flag(raw, "type"), flag(raw, "evolution"),
          flag(raw, "typeCount"), flag(raw, "category"));
    }
  }

  /** {@code defaultPokedexEntryGuessConfig}. */
  public static PokedexEntryGuessConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new PokedexEntryGuessConfig(generations, 25, 10, false,
        new PokedexEntryHintConfig(true, true, true, false, false));
  }

  /**
   * {@code pokedexEntryGuessConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes y,
   * con {@code hintsEnabled}, al menos una pista ({@code superRefine}, que solo corre si el resto es válido). Los
   * enteros admiten {@code 15.0} y rechazan {@code 15.5}.
   */
  public static PokedexEntryGuessConfig parse(JsonNode raw) {
    strict(raw, KEYS, "la configuración");
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", 15, 60);
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 20);
    boolean hintsEnabled = flag(raw, "hintsEnabled");
    var hints = PokedexEntryHintConfig.parse(required(raw, "hints"));
    if (hintsEnabled && !hints.any()) throw invalid("Selecciona al menos una pista adicional");
    return new PokedexEntryGuessConfig(new ArrayList<>(generations), roundSeconds, rounds, hintsEnabled, hints);
  }

  /** {@code z.object({...}).strict()}: objeto sin claves ajenas al esquema. */
  private static void strict(JsonNode raw, Set<String> keys, String what) {
    if (raw == null || !raw.isObject()) throw invalid(what + " debe ser un objeto");
    for (var entry : raw.entries()) {
      if (!keys.contains(entry.getKey())) throw invalid("clave desconocida " + entry.getKey());
    }
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
    return new ConfigValidationException("Configuración de Pokédex Entry Guess no válida: " + detail + ".");
  }
}

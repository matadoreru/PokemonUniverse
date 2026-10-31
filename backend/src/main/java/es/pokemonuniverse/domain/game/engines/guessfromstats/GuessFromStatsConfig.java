package es.pokemonuniverse.domain.game.engines.guessfromstats;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code guessFromStatsConfigSchema} de {@code guess-from-stats/config.ts}). El esquema es
 * {@code .strict()} en la raíz, en {@code stats} y en {@code hints}: una clave desconocida en cualquiera de los tres
 * invalida la configuración.
 */
@Serdeable
public record GuessFromStatsConfig(
    List<Integer> generations,
    int roundSeconds,
    int rounds,
    GuessFromStatsFields stats,
    boolean hintsEnabled,
    GuessFromStatsHints hints) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS = Set.of("generations", "roundSeconds", "rounds", "stats", "hintsEnabled", "hints");

  public GuessFromStatsConfig {
    generations = List.copyOf(generations);
  }

  /** {@code guessFromStatsFieldsSchema}: qué estadísticas base se muestran (claves de TS, en su orden). */
  @Serdeable
  public record GuessFromStatsFields(boolean hp, boolean attack, boolean defense, boolean specialAttack,
      boolean specialDefense, boolean speed, boolean bst) {

    static final Set<String> KEYS = Set.of("hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "bst");

    /** {@code config.stats[key]} con la clave de TS. */
    public boolean enabled(String key) {
      return switch (key) {
        case "hp" -> hp;
        case "attack" -> attack;
        case "defense" -> defense;
        case "specialAttack" -> specialAttack;
        case "specialDefense" -> specialDefense;
        case "speed" -> speed;
        case "bst" -> bst;
        default -> throw new IllegalArgumentException("Estadística desconocida: " + key);
      };
    }

    int enabledCount() {
      int count = 0;
      for (boolean value : List.of(hp, attack, defense, specialAttack, specialDefense, speed, bst)) count += value ? 1 : 0;
      return count;
    }

    /** Cada argumento se lee por su clave literal; el orden posicional es el del esquema. */
    static GuessFromStatsFields parse(JsonNode raw) {
      strict(raw, KEYS, "stats");
      return new GuessFromStatsFields(flag(raw, "hp"), flag(raw, "attack"), flag(raw, "defense"),
          flag(raw, "specialAttack"), flag(raw, "specialDefense"), flag(raw, "speed"), flag(raw, "bst"));
    }
  }

  /** {@code guessFromStatsHintsSchema}: pistas adicionales (claves de TS, en su orden). */
  @Serdeable
  public record GuessFromStatsHints(boolean generation, boolean types, boolean typeCount, boolean evolution,
      boolean height, boolean weight, boolean category) {

    static final Set<String> KEYS = Set.of("generation", "types", "typeCount", "evolution", "height", "weight", "category");

    boolean any() {
      return generation || types || typeCount || evolution || height || weight || category;
    }

    /** Cada argumento se lee por su clave literal; el orden posicional es el del esquema. */
    static GuessFromStatsHints parse(JsonNode raw) {
      strict(raw, KEYS, "hints");
      return new GuessFromStatsHints(flag(raw, "generation"), flag(raw, "types"), flag(raw, "typeCount"),
          flag(raw, "evolution"), flag(raw, "height"), flag(raw, "weight"), flag(raw, "category"));
    }
  }

  /** {@code defaultGuessFromStatsConfig}. */
  public static GuessFromStatsConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new GuessFromStatsConfig(generations, 30, 10,
        new GuessFromStatsFields(true, true, true, true, true, true, false), false,
        new GuessFromStatsHints(true, true, false, true, false, false, false));
  }

  /**
   * {@code guessFromStatsConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes; al
   * menos 2 estadísticas y, con {@code hintsEnabled}, al menos una pista ({@code superRefine}). Los enteros admiten
   * {@code 15.0} y rechazan {@code 15.5}.
   */
  public static GuessFromStatsConfig parse(JsonNode raw) {
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
    var stats = GuessFromStatsFields.parse(required(raw, "stats"));
    boolean hintsEnabled = flag(raw, "hintsEnabled");
    var hints = GuessFromStatsHints.parse(required(raw, "hints"));
    if (stats.enabledCount() < 2) throw invalid("Selecciona al menos 2 estadísticas");
    if (hintsEnabled && !hints.any()) throw invalid("Selecciona al menos una pista adicional");
    return new GuessFromStatsConfig(new ArrayList<>(generations), roundSeconds, rounds, stats, hintsEnabled, hints);
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
    return new ConfigValidationException("Configuración de Guess from Stats no válida: " + detail + ".");
  }
}

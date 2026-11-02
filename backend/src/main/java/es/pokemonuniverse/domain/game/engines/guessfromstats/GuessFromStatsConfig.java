package es.pokemonuniverse.domain.game.engines.guessfromstats;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

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
    static GuessFromStatsFields parse(ConfigReader stats) {
      stats.strict(KEYS);
      return new GuessFromStatsFields(stats.bool("hp"), stats.bool("attack"), stats.bool("defense"),
          stats.bool("specialAttack"), stats.bool("specialDefense"), stats.bool("speed"), stats.bool("bst"));
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
    static GuessFromStatsHints parse(ConfigReader hints) {
      hints.strict(KEYS);
      return new GuessFromStatsHints(hints.bool("generation"), hints.bool("types"), hints.bool("typeCount"),
          hints.bool("evolution"), hints.bool("height"), hints.bool("weight"), hints.bool("category"));
    }
  }

  /** {@code defaultGuessFromStatsConfig}. */
  public static GuessFromStatsConfig defaults() {
    var generations = ConfigReader.allGenerations();
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
    var config = ConfigReader.of(raw, "Guess from Stats");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int roundSeconds = config.integer("roundSeconds", 15, 60);
    int rounds = config.integer("rounds", 1, 20);
    var stats = GuessFromStatsFields.parse(config.object("stats"));
    boolean hintsEnabled = config.bool("hintsEnabled");
    var hints = GuessFromStatsHints.parse(config.object("hints"));
    if (stats.enabledCount() < 2) throw config.invalidAt("stats", "Selecciona al menos 2 estadísticas");
    if (hintsEnabled && !hints.any()) throw config.invalidAt("hints", "Selecciona al menos una pista adicional");
    return new GuessFromStatsConfig(generations, roundSeconds, rounds, stats, hintsEnabled, hints);
  }
}

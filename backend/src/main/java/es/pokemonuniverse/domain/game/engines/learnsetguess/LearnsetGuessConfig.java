package es.pokemonuniverse.domain.game.engines.learnsetguess;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Set;

/**
 * Configuración normalizada ({@code learnsetGuessConfigSchema} de {@code learnset-guess/config.ts}). El esquema es
 * {@code .strict()}: una clave desconocida invalida la configuración.
 */
@Serdeable
public record LearnsetGuessConfig(
    List<Integer> generations,
    boolean showLevels,
    boolean showEvolution,
    int roundSeconds,
    int rounds) {

  private static final Set<String> KEYS = Set.of("generations", "showLevels", "showEvolution", "roundSeconds", "rounds");

  public LearnsetGuessConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultLearnsetGuessConfig}. */
  public static LearnsetGuessConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new LearnsetGuessConfig(generations, true, true, 60, 10);
  }

  /**
   * {@code learnsetGuessConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes. Los
   * enteros admiten {@code 15.0} y rechazan {@code 15.5}.
   */
  public static LearnsetGuessConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Learnset Guess");
    config.strict(KEYS);
    var generations = config.generations("generations");
    boolean showLevels = config.bool("showLevels");
    boolean showEvolution = config.bool("showEvolution");
    int roundSeconds = config.integer("roundSeconds", 15, 120);
    int rounds = config.integer("rounds", 1, 20);
    return new LearnsetGuessConfig(generations, showLevels, showEvolution, roundSeconds, rounds);
  }
}

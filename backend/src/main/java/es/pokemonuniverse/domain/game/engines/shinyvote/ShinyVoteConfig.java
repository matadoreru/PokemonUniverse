package es.pokemonuniverse.domain.game.engines.shinyvote;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

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

  public ShinyVoteConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultShinyVoteConfig}. */
  public static ShinyVoteConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new ShinyVoteConfig(generations, 20, 10, CandidateMode.SAME_POKEMON, 4, true);
  }

  /**
   * {@code shinyVoteConfigSchema.parse}: {@code generations} sin duplicados y ascendentes
   * ({@code pokemonGenerationsSchema}); {@code candidateMode} distingue mayúsculas. Los enteros admiten {@code 10.0} y
   * rechazan {@code 10.5}.
   */
  public static ShinyVoteConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Shiny Quiz");
    var generations = config.generations("generations");
    int roundSeconds = config.integer("roundSeconds", 10, 60);
    int rounds = config.integer("rounds", 1, 50);
    var candidateMode = config.enumValue("candidateMode", CandidateMode.class,
        "candidateMode debe ser SAME_POKEMON o DIFFERENT_POKEMON");
    int optionCount = config.integer("optionCount", 3, 6);
    boolean showVotes = config.bool("showVotes");
    return new ShinyVoteConfig(generations, roundSeconds, rounds, candidateMode, optionCount, showVotes);
  }
}

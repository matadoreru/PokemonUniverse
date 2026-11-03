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
    VoteVisibility voteVisibility,
    int revealSeconds) {

  /** {@code SHINY_REVEAL_SECONDS_RANGE}: duración de la revelación de cada ronda, en segundos. */
  public static final int REVEAL_SECONDS_MIN = 3;
  public static final int REVEAL_SECONDS_MAX = 6;

  /** {@code SHINY_CANDIDATE_MODES}. */
  public enum CandidateMode { SAME_POKEMON, DIFFERENT_POKEMON }

  /**
   * {@code SHINY_VOTE_VISIBILITIES}: {@code REVEAL} publica los votos al revelar la ronda; {@code LIVE} los muestra
   * mientras sigue abierta (permite copiar).
   */
  public enum VoteVisibility { REVEAL, LIVE }

  public ShinyVoteConfig {
    generations = List.copyOf(generations);
  }

  /** {@code defaultShinyVoteConfig}. */
  public static ShinyVoteConfig defaults() {
    var generations = ConfigReader.allGenerations();
    return new ShinyVoteConfig(generations, 20, 10, CandidateMode.SAME_POKEMON, 4, VoteVisibility.REVEAL, 4);
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
    var voteVisibility = config.enumValue("voteVisibility", VoteVisibility.class);
    int revealSeconds = config.integer("revealSeconds", REVEAL_SECONDS_MIN, REVEAL_SECONDS_MAX);
    return new ShinyVoteConfig(generations, roundSeconds, rounds, candidateMode, optionCount, voteVisibility,
        revealSeconds);
  }
}

package es.pokemonuniverse.domain.game.engines.shinyvote;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyPlayerStats;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteTypes.ShinyVoteState;
import java.util.Comparator;
import java.util.LinkedHashMap;

/** Traducción literal de {@code shiny-vote/rules.ts}. */
public final class ShinyVoteRules {

  /** {@code SHINY_ORDER_BONUSES}. */
  static final int[] ORDER_BONUSES = {3, 2, 1};

  private ShinyVoteRules() {}

  /** Cada acierto vale 1 punto; los tres primeros aciertos suman 3/2/1 según su hora de voto autoritativa. */
  public static int shinyPointsForOrder(int solveOrder) {
    return 1 + (solveOrder >= 1 && solveOrder <= ORDER_BONUSES.length ? ORDER_BONUSES[solveOrder - 1] : 0);
  }

  public static GameResults buildShinyResults(ShinyVoteState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, ShinyPlayerStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<ShinyPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<ShinyPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> {
      var stats = entry.stats();
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("correctVotes", stats.correctVotes());
      mapped.put("votes", stats.votes());
      mapped.put("incorrectVotes", stats.votes() - stats.correctVotes());
      mapped.put("unanswered", Math.max(0, state.config().rounds() - stats.votes()));
      // Math.round(correctVotes / votes * 100) de JS: división en coma flotante y redondeo de mitades hacia +∞.
      mapped.put("accuracy", stats.votes() == 0 ? 0 : Math.round((double) stats.correctVotes() / stats.votes() * 100));
      return mapped;
    });
  }
}

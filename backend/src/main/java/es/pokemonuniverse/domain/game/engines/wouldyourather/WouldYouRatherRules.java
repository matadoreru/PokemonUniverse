package es.pokemonuniverse.domain.game.engines.wouldyourather;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherState;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherStats;
import java.util.Comparator;

/** Traducción literal del TS que antes estaba en {@code would-you-rather/rules.ts}. */
public final class WouldYouRatherRules {

  /** {@code WOULD_YOU_RATHER_MAJORITY_POINTS}. */
  public static final int MAJORITY_POINTS = 1;
  /** {@code WOULD_YOU_RATHER_PREDICTION_POINTS}. */
  public static final int PREDICTION_POINTS = 2;

  private WouldYouRatherRules() {}

  static WouldYouRatherStats statsOf(WouldYouRatherState state, String playerId) {
    var stats = state.playerStats().get(playerId);
    return stats == null ? WouldYouRatherStats.ZERO : stats;
  }

  /**
   * Puntos, predicciones acertadas y elecciones mayoritarias, de mayor a menor. El desempate de TS es
   * {@code playerId.localeCompare}; aquí {@link String#compareTo}, equivalente para los ids del servidor (cuid y
   * {@code guest_<uuid>}; ver el README de motores).
   */
  public static GameResults buildWouldYouRatherResults(WouldYouRatherState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before Would You Rather finishes");
    var entries = Scoring.scoreEntries(state.playerIds(), state.scores(), playerId -> statsOf(state, playerId));
    Comparator<Scoring.ScoreEntry<WouldYouRatherStats>> compare = (left, right) -> {
      int result = Integer.compare(right.points(), left.points());
      if (result == 0) result = Integer.compare(right.stats().correctPredictions(), left.stats().correctPredictions());
      if (result == 0) result = Integer.compare(right.stats().majorityChoices(), left.stats().majorityChoices());
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare,
        entry -> entry.points() + ":" + entry.stats().correctPredictions() + ":" + entry.stats().majorityChoices(),
        entry -> entry.stats().toMap());
  }
}

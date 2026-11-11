package es.pokemonuniverse.domain.game.engines.mostlikelyto;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToState;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToStats;
import java.util.Comparator;

/** Traducción literal del TS que antes estaba en {@code most-likely-to/rules.ts}. */
public final class MostLikelyToRules {

  /** {@code MOST_LIKELY_TO_WIN_POINTS}. */
  public static final int WIN_POINTS = 3;

  private MostLikelyToRules() {}

  static MostLikelyToStats statsOf(MostLikelyToState state, String playerId) {
    var stats = state.playerStats().get(playerId);
    return stats == null ? MostLikelyToStats.ZERO : stats;
  }

  /**
   * Puntos, victorias en solitario, victorias y votos recibidos, de mayor a menor. El desempate de TS es
   * {@code playerId.localeCompare}; aquí {@link String#compareTo}, equivalente para los ids del servidor (cuid y
   * {@code guest_<uuid>}; ver el README de motores).
   */
  public static GameResults buildMostLikelyToResults(MostLikelyToState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before Most Likely To finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            statsOf(state, playerId)))
        .toList();
    Comparator<Scoring.ScoreEntry<MostLikelyToStats>> compare = (left, right) -> {
      int result = Integer.compare(right.points(), left.points());
      if (result == 0) result = Integer.compare(right.stats().soloWins(), left.stats().soloWins());
      if (result == 0) result = Integer.compare(right.stats().roundWins(), left.stats().roundWins());
      if (result == 0) result = Integer.compare(right.stats().votesReceived(), left.stats().votesReceived());
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare,
        entry -> entry.points() + ":" + entry.stats().soloWins() + ":" + entry.stats().roundWins() + ":"
            + entry.stats().votesReceived(),
        entry -> entry.stats().toMap());
  }
}

package es.pokemonuniverse.domain.game.engines.oneofusisfake;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.OneOfUsIsFakeState;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.OneOfUsIsFakeStats;
import java.util.Comparator;

/** Traducción literal del TS que antes estaba en {@code one-of-us-is-fake/rules.ts}. */
public final class OneOfUsIsFakeRules {

  /** {@code NORMAL_ROUND_POINTS}. */
  public static final int NORMAL_ROUND_POINTS = 2;
  /** {@code FAKE_ROUND_POINTS}. */
  public static final int FAKE_ROUND_POINTS = 4;

  private OneOfUsIsFakeRules() {}

  static OneOfUsIsFakeStats statsOf(OneOfUsIsFakeState state, String playerId) {
    var stats = state.playerStats().get(playerId);
    return stats == null ? OneOfUsIsFakeStats.ZERO : stats;
  }

  /**
   * Puntos, victorias (como fake y como normal) y votos correctos, de mayor a menor; el empate de posición solo mira
   * los puntos. El desempate de TS es {@code playerId.localeCompare}; aquí {@link String#compareTo}, equivalente para
   * los ids del servidor (ver el README de motores).
   */
  public static GameResults buildOneOfUsIsFakeResults(OneOfUsIsFakeState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before the game finishes");
    var entries = Scoring.scoreEntries(state.playerIds(), state.scores(), playerId -> statsOf(state, playerId));
    Comparator<Scoring.ScoreEntry<OneOfUsIsFakeStats>> compare = (left, right) -> {
      int result = Integer.compare(right.points(), left.points());
      if (result == 0) result = Integer.compare(right.stats().victories(), left.stats().victories());
      if (result == 0) result = Integer.compare(right.stats().correctVotes(), left.stats().correctVotes());
      return result != 0 ? result : left.playerId().compareTo(right.playerId());
    };
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> entry.stats().toMap());
  }
}

package es.pokemonuniverse.domain.game.engines.oddoneout;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutPlayerStats;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutState;
import java.util.Comparator;
import java.util.LinkedHashMap;

/** Reglas puras de El Intruso (contrapartida de {@code odd-one-out/rules.ts}, más las del motor). */
public final class OddOneOutRules {

  /** Pokémon por tablero: tres de la categoría y el intruso. */
  public static final int OPTION_COUNT = 4;
  /** {@code ODD_ONE_OUT_ORDER_BONUSES}: extra para el primer, segundo y tercer acierto; el resto, 0. */
  public static final int[] ORDER_BONUSES = {3, 2, 1};
  /** Duración de la revelación de cada ronda. */
  public static final long REVEAL_MS = 5_000;

  private OddOneOutRules() {}

  /** Cada acierto vale 1 punto, más el extra de su orden entre los que aciertan (desde 1, por {@code votedAt}). */
  public static int pointsForOrder(int solveOrder) {
    return 1 + (solveOrder >= 1 && solveOrder <= ORDER_BONUSES.length ? ORDER_BONUSES[solveOrder - 1] : 0);
  }

  /** Clasificación final: puntos y después id del jugador; estadísticas como las de Shiny Quiz. */
  public static GameResults buildResults(OddOneOutState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before the game finishes");
    var entries = Scoring.scoreEntries(state.playerIds(), state.scores(),
        playerId -> state.playerStats().getOrDefault(playerId, OddOneOutPlayerStats.ZERO));
    Comparator<Scoring.ScoreEntry<OddOneOutPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<OddOneOutPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> {
      var stats = entry.stats();
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("correctVotes", stats.correctVotes());
      mapped.put("votes", stats.votes());
      mapped.put("incorrectVotes", stats.votes() - stats.correctVotes());
      mapped.put("unanswered", Math.max(0, state.config().rounds() - stats.votes()));
      // Como Math.round de JS: división en coma flotante y redondeo de mitades hacia +∞.
      mapped.put("accuracy", stats.votes() == 0 ? 0 : Math.round((double) stats.correctVotes() / stats.votes() * 100));
      return mapped;
    });
  }
}

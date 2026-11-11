package es.pokemonuniverse.domain.game.engines.learnsetguess;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessPlayerStats;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessState;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * Traducción literal del TS que antes estaba en {@code learnset-guess/rules.ts}. La web conserva allí una copia de
 * {@code learnsetPoints} y {@code learnsetManualRevealPoints}: si cambian aquí, hay que cambiarlas también allí.
 */
public final class LearnsetGuessRules {

  public static final int LEARNSET_INITIAL_POINTS = 5;
  public static final int LEARNSET_MIN_POINTS = 1;
  /** {@code LEARNSET_ORDER_BONUSES}: extra para el primero y el segundo en acertar, en el orden en que se procesan. */
  public static final List<Integer> ORDER_BONUSES = List.of(2, 1);
  /** {@code LEARNSET_LAST_WARNING_MS}: si solo falta un jugador requerido, la ronda se cierra como mucho en 10 s. */
  public static final long LAST_WARNING_MS = 10_000;

  private LearnsetGuessRules() {}

  /**
   * Cinco puntos con las pistas iniciales, uno menos por cada grupo extra revelado y nunca menos de uno, más el bonus
   * por orden ({@code bonus[solveOrder - 1] ?? 0}: fuera de rango no suma).
   */
  public static int learnsetPoints(int revealStage, int solveOrder) {
    int bonus = solveOrder >= 1 && solveOrder <= ORDER_BONUSES.size() ? ORDER_BONUSES.get(solveOrder - 1) : 0;
    return Math.max(LEARNSET_MIN_POINTS, LEARNSET_INITIAL_POINTS - revealStage) + bonus;
  }

  /**
   * {@code MANUAL_REVEAL}: acertar con {@code visibleGroups} grupos a la vista vale
   * {@code max(1, totalGroups - visibleGroups + 1) × 10}, sin bonus por orden.
   */
  public static int manualRevealPoints(int totalGroups, int visibleGroups) {
    return Math.max(1, totalGroups - visibleGroups + 1) * 10;
  }

  /**
   * Clasificación final: puntos descendentes y, al final, {@code playerId.localeCompare}, aquí
   * {@link String#compareTo} (equivalente sobre ids de jugador, regla 21 del README de motores). Sin {@code mapStats}:
   * las estadísticas se copian tal cual ({@code { ...entry.stats }}) en el orden de sus claves.
   */
  public static GameResults buildLearnsetResults(LearnsetGuessState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before the game finishes");
    var entries = Scoring.scoreEntries(state.playerIds(), state.scores(),
        playerId -> state.playerStats().getOrDefault(playerId, LearnsetGuessPlayerStats.ZERO));
    Comparator<Scoring.ScoreEntry<LearnsetGuessPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<LearnsetGuessPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> {
      var stats = entry.stats();
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("correct", stats.correct());
      mapped.put("missed", stats.missed());
      mapped.put("initialSolves", stats.initialSolves());
      mapped.put("incorrectGuesses", stats.incorrectGuesses());
      mapped.put("pointsFromSolves", stats.pointsFromSolves());
      mapped.put("bestRoundPoints", stats.bestRoundPoints());
      return mapped;
    });
  }
}

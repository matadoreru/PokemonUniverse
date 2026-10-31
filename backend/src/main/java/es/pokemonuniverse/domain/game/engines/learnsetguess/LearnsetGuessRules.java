package es.pokemonuniverse.domain.game.engines.learnsetguess;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessPlayerStats;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessTypes.LearnsetGuessState;
import java.util.Comparator;
import java.util.LinkedHashMap;

/** Traducción literal de {@code learnset-guess/rules.ts}. */
public final class LearnsetGuessRules {

  public static final int LEARNSET_INITIAL_POINTS = 5;
  public static final int LEARNSET_MIN_POINTS = 1;

  private LearnsetGuessRules() {}

  /** Cinco puntos con las pistas iniciales, uno menos por cada grupo extra revelado y nunca menos de uno. */
  public static int learnsetPoints(int revealStage) {
    return Math.max(LEARNSET_MIN_POINTS, LEARNSET_INITIAL_POINTS - revealStage);
  }

  /**
   * Clasificación final: puntos descendentes y, al final, {@code playerId.localeCompare}, aquí
   * {@link String#compareTo} (equivalente sobre ids de jugador, regla 21 del README de motores). Sin {@code mapStats}:
   * las estadísticas se copian tal cual ({@code { ...entry.stats }}) en el orden de sus claves.
   */
  public static GameResults buildLearnsetResults(LearnsetGuessState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, LearnsetGuessPlayerStats.ZERO)))
        .toList();
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

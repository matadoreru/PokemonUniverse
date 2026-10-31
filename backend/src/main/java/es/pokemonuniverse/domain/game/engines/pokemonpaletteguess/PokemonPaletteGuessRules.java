package es.pokemonuniverse.domain.game.engines.pokemonpaletteguess;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteGuessState;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteScore;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteStats;
import java.util.Comparator;
import java.util.LinkedHashMap;

/** Traducción literal de {@code pokemon-palette-guess/rules.ts}. */
public final class PokemonPaletteGuessRules {

  /** {@code PODIUM_BONUSES}. */
  private static final int[] PODIUM_BONUSES = {3, 2, 1};

  private PokemonPaletteGuessRules() {}

  /** Hasta 10 puntos por rapidez (mínimo 1) más el podio; aritmética {@code double}, como JS. */
  public static PokemonPaletteScore pokemonPaletteScore(long roundStartedAt, int roundSeconds, long solvedAt,
      int solveOrder) {
    long duration = roundSeconds * 1_000L;
    long elapsed = Math.max(0, Math.min(duration, solvedAt - roundStartedAt));
    int speedPoints = Math.max(1, (int) Math.ceil(Math.max(0, 1 - (double) elapsed / duration) * 10));
    int placementBonus = solveOrder >= 1 && solveOrder <= PODIUM_BONUSES.length ? PODIUM_BONUSES[solveOrder - 1] : 0;
    return new PokemonPaletteScore(speedPoints, placementBonus, speedPoints + placementBonus);
  }

  /**
   * Clasificación final: puntos y aciertos descendentes y, al final, {@code playerId.localeCompare}, aquí
   * {@link String#compareTo} (equivalente sobre ids de jugador, regla 21 del README de motores). Sin {@code mapStats}:
   * las estadísticas se copian tal cual ({@code { ...entry.stats }}).
   */
  public static GameResults buildPokemonPaletteResults(PokemonPaletteGuessState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, PokemonPaletteStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<PokemonPaletteStats>> compare = Comparator
        .<Scoring.ScoreEntry<PokemonPaletteStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> -entry.stats().correct())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> {
      var stats = entry.stats();
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("correct", stats.correct());
      mapped.put("missed", stats.missed());
      mapped.put("totalAttempts", stats.totalAttempts());
      mapped.put("firstTry", stats.firstTry());
      mapped.put("roundFirsts", stats.roundFirsts());
      mapped.put("solveTimeTotalMs", stats.solveTimeTotalMs());
      mapped.put("bestTimeMs", stats.bestTimeMs());
      mapped.put("pointsFromRounds", stats.pointsFromRounds());
      return mapped;
    });
  }
}

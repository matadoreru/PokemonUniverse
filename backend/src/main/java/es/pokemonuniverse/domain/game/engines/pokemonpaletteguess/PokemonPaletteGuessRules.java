package es.pokemonuniverse.domain.game.engines.pokemonpaletteguess;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteGuessState;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteStats;
import java.util.Comparator;
import java.util.LinkedHashMap;

/** Traducción literal del TS que antes estaba en {@code pokemon-palette-guess/rules.ts}. */
public final class PokemonPaletteGuessRules {

  private PokemonPaletteGuessRules() {}

  /**
   * Clasificación final: puntos y aciertos descendentes y, al final, {@code playerId.localeCompare}, aquí
   * {@link String#compareTo} (equivalente sobre ids de jugador, regla 21 del README de motores). Sin {@code mapStats}:
   * las estadísticas se copian tal cual ({@code { ...entry.stats }}).
   */
  public static GameResults buildPokemonPaletteResults(PokemonPaletteGuessState state) {
    Scoring.requireFinished(state.phase(), "Results are unavailable before the game finishes");
    var entries = Scoring.scoreEntries(state.playerIds(), state.scores(),
        playerId -> state.playerStats().getOrDefault(playerId, PokemonPaletteStats.ZERO));
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

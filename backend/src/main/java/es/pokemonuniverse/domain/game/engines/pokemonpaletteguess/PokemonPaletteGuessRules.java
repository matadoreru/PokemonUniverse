package es.pokemonuniverse.domain.game.engines.pokemonpaletteguess;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.GuessPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteGuessState;
import java.util.Comparator;

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
        playerId -> state.playerStats().getOrDefault(playerId, GuessPlayerStats.ZERO));
    Comparator<Scoring.ScoreEntry<GuessPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<GuessPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> -entry.stats().correct())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> entry.stats().toMap());
  }
}

package es.pokemonuniverse.domain.game.engines.pokemoncryquiz;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizState;
import java.util.Comparator;

/** Traducción literal del TS que antes estaba en {@code pokemon-cry-quiz/rules.ts}. */
public final class PokemonCryQuizRules {

  private PokemonCryQuizRules() {}

  public static GameResults buildPokemonCryResults(PokemonCryQuizState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, PokemonCryQuizPlayerStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<PokemonCryQuizPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<PokemonCryQuizPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> -entry.stats().correct())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare, Scoring.ScoreEntry::points, entry -> entry.stats().toMap());
  }
}

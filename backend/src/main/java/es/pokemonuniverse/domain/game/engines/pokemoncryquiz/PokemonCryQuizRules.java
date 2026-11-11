package es.pokemonuniverse.domain.game.engines.pokemoncryquiz;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.GuessPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizState;
import java.util.Comparator;

/** Traducción literal del TS que antes estaba en {@code pokemon-cry-quiz/rules.ts}. */
public final class PokemonCryQuizRules {

  private PokemonCryQuizRules() {}

  public static GameResults buildPokemonCryResults(PokemonCryQuizState state) {
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

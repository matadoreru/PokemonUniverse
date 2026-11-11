package es.pokemonuniverse.domain.game.engines.pokemoncryquiz;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizPlayerStats;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryQuizState;
import es.pokemonuniverse.domain.game.engines.pokemoncryquiz.PokemonCryQuizTypes.PokemonCryScore;
import java.util.Comparator;

/** Traducción literal del TS que antes estaba en {@code pokemon-cry-quiz/rules.ts}. */
public final class PokemonCryQuizRules {

  /** {@code POKEMON_CRY_PODIUM_BONUSES}. */
  static final int[] PODIUM_BONUSES = {3, 2, 1};

  private PokemonCryQuizRules() {}

  /** {@code pokemonCryScore}: la proporción restante es una división en coma flotante, como en JS. */
  public static PokemonCryScore pokemonCryScore(long roundStartedAt, int roundSeconds, long solvedAt, int solveOrder) {
    long duration = roundSeconds * 1_000L;
    long elapsed = Math.max(0, Math.min(duration, solvedAt - roundStartedAt));
    int speedPoints = (int) Math.max(1, Math.ceil(Math.max(0, 1 - (double) elapsed / duration) * 10));
    int placementBonus = solveOrder >= 1 && solveOrder <= PODIUM_BONUSES.length ? PODIUM_BONUSES[solveOrder - 1] : 0;
    return new PokemonCryScore(speedPoints, placementBonus, speedPoints + placementBonus);
  }

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

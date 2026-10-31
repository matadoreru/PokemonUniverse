package es.pokemonuniverse.domain.game.engine.infra;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;

/** Transiciones propias de un juego para {@link Timing#advanceTimedRound}. */
public interface TimedRoundStrategy<S extends TimedGameState> {

  S beginNext(S state, GameContext context);

  S resolveActive(S state, GameContext context);

  S finish(S state, GameContext context);

  boolean isComplete(S state);

  /** {@code tickActive?.(state, context) ?? state}: sin implementar devuelve el mismo estado. */
  default S tickActive(S state, GameContext context) {
    return state;
  }

  default GamePhase activePhase() {
    return GamePhase.ROUND_ACTIVE;
  }

  default GamePhase resultsPhase() {
    return GamePhase.ROUND_RESULTS;
  }
}

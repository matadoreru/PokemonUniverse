package es.pokemonuniverse.domain.game.engine.infra;

import es.pokemonuniverse.domain.game.engine.GameContext;

/**
 * Transiciones propias de un juego para {@link Timing#advanceTimedRound}, con {@code ROUND_ACTIVE} y
 * {@code ROUND_RESULTS} como fases activa y de resultados.
 */
public interface TimedRoundStrategy<S extends TimedGameState> {

  S beginNext(S state, GameContext context);

  S resolveActive(S state, GameContext context);

  S finish(S state, GameContext context);

  boolean isComplete(S state);

  /** {@code tickActive?.(state, context) ?? state}: sin implementar devuelve el mismo estado. */
  default S tickActive(S state, GameContext context) {
    return state;
  }
}

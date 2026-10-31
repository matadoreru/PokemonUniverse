package es.pokemonuniverse.domain.room;

import es.pokemonuniverse.domain.game.engine.GamePhase;

/** {@code RoomPhase} de {@code room.ts}: el lobby, cualquier fase de un minijuego y las fases de sesión. */
public enum RoomPhase {
  LOBBY,
  GAME_STARTING,
  ROUND_ACTIVE,
  ROUND_RESULTS,
  TIEBREAKER_ACTIVE,
  ROLE_REVEAL,
  CLUE_PHASE,
  VOTING,
  VOTE_RESULTS,
  ELIMINATION,
  SELECTING_TYPES,
  TYPE_REVEAL,
  INVALID_COMBINATION,
  POKEMON_SEARCH,
  TURN_ACTIVE,
  CHOICE_REVEAL,
  DISCUSSION,
  REVOTE,
  GAME_RESULTS,
  NEXT_GAME_VOTE,
  NEXT_GAME_VOTE_RESULTS,
  SESSION_RESULTS;

  /** {@code room.phase = lifecycle.phase}: cada {@link GamePhase} tiene una fase de sala con el mismo nombre. */
  public static RoomPhase of(GamePhase phase) {
    return valueOf(phase.name());
  }
}

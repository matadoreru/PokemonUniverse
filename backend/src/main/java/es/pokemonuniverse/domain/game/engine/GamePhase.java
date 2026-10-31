package es.pokemonuniverse.domain.game.engine;

/** Fases comunes de los minijuegos ({@code GamePhase} de {@code contracts.ts}); se serializan por nombre. */
public enum GamePhase {
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
  GAME_RESULTS
}

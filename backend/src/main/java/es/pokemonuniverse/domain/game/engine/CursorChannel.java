package es.pokemonuniverse.domain.game.engine;

import java.util.List;

/** Canal de cursores en vivo de un jugador: con quién los comparte y sobre qué objetivos. */
public record CursorChannel(List<String> playerIds, List<String> targetIds) {}

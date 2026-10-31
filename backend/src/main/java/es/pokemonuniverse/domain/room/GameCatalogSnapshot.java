package es.pokemonuniverse.domain.room;

import es.pokemonuniverse.domain.pokemon.PokemonCatalog;

/** Catálogo fijado por una partida: la siguiente partida usa el reemplazo, la actual conserva el suyo. */
public record GameCatalogSnapshot(String version, PokemonCatalog pokemon) {}

package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.pokemon.PokemonCatalog;

/** Catálogo de Pokémon con el que arrancan las partidas (el {@code PokemonCatalog} del constructor de Node). */
public interface GameCatalogProvider {

  PokemonCatalog loadPokemonCatalog();
}

package es.pokemonuniverse.application.rooms;

/**
 * Catálogos con los que arrancan las partidas (el {@code PokemonCatalog}, {@code PokemonVisualCatalog} y
 * {@code PokemonAudioCatalog} del constructor de Node).
 */
public interface GameCatalogProvider {

  GameCatalogs loadPokemonCatalog();
}

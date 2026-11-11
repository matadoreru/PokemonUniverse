package es.pokemonuniverse.domain.pokemon;

import java.util.List;

/** Catálogo con entradas de Pokédex ({@code PokedexEntryPokemonCatalog}, antes en {@code pokemon/types.ts}). */
public interface PokedexEntryPokemonCatalog extends PokemonCatalog {

  /** Generación más reciente primero y después por versión; vacío si no hay datos. */
  List<PokedexEntry> pokedexEntries(String pokemonId);
}

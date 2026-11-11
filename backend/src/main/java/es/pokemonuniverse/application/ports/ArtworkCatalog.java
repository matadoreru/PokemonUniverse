package es.pokemonuniverse.application.ports;

import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog;
import java.util.Set;

/** Artworks locales de los Pokémon, indexados contra los ids del catálogo vigente. */
@FunctionalInterface
public interface ArtworkCatalog {

  /** Indexa y valida los artworks de {@code catalogIds}; sin directorio de artworks, un catálogo vacío. */
  PokemonVisualCatalog load(Set<String> catalogIds);
}

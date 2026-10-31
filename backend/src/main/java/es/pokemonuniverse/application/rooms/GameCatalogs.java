package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog;
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import io.micronaut.core.annotation.Nullable;

/** Catálogos con los que arranca una partida: Pokémon, artworks locales y gritos ({@code replaceCatalog} de Node). */
public record GameCatalogs(PokemonCatalog pokemon, @Nullable PokemonVisualCatalog visuals,
    @Nullable PokemonAudioCatalog audio) {

  /** Solo el catálogo de Pokémon, sin artworks ni gritos. */
  public static GameCatalogs of(PokemonCatalog pokemon) {
    return new GameCatalogs(pokemon, null, null);
  }
}

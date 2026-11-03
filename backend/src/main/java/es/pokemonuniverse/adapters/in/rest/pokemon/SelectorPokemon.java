package es.pokemonuniverse.adapters.in.rest.pokemon;

import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonSpritePaths;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Entrada del buscador de Pokémon: solo id, nombre y una URL de sprite opaca servida por Java. Sin número de Pokédex,
 * generación, tipos, estadísticas ni sprite shiny, que darían la respuesta en varios minijuegos.
 */
@Serdeable
@Schema(name = "SelectorPokemon")
public record SelectorPokemon(String id, String name, String sprite) {

  static SelectorPokemon from(Pokemon pokemon) {
    return new SelectorPokemon(pokemon.id(), pokemon.name(), PokemonSpritePaths.of(pokemon.id()));
  }
}

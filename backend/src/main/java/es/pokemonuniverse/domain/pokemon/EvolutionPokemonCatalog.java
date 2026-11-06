package es.pokemonuniverse.domain.pokemon;

import java.util.List;
import java.util.Optional;

/**
 * Catálogo con las relaciones padre → hijo de las cadenas evolutivas, para los motores que recalculan la etapa con
 * solo una parte de la familia (por ejemplo, las generaciones elegidas en la sala).
 */
public interface EvolutionPokemonCatalog extends PokemonCatalog {

  /** Pokémon del que evoluciona; vacío si es la base de su cadena o no hay datos. */
  Optional<String> preEvolutionId(String pokemonId);

  /** Pokémon a los que evoluciona directamente, en el orden en que llegaron las aristas; vacío si no tiene. */
  List<String> evolutionIds(String pokemonId);
}

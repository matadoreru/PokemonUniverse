package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.model.Sort;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;

@Repository
public interface PokemonEvolutionRepository extends CrudRepository<PokemonEvolutionEntity, String> {

  List<PokemonEvolutionEntity> findAll(Sort sort);
}

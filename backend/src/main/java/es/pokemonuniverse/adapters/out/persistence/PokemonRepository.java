package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.model.Sort;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;

@Repository
public interface PokemonRepository extends CrudRepository<PokemonEntity, String> {

  List<PokemonEntity> findAll(Sort sort);
}

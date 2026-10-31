package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.model.Sort;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;

@Repository
public interface PokemonLevelUpMoveRepository
    extends CrudRepository<PokemonLevelUpMoveEntity, PokemonLevelUpMoveEntity.Key> {

  List<PokemonLevelUpMoveEntity> findAll(Sort sort);
}

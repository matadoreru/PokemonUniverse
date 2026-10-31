package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.model.Sort;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;

@Repository
public interface PokedexEntryRepository extends CrudRepository<PokedexEntryEntity, String> {

  List<PokedexEntryEntity> findAll(Sort sort);
}

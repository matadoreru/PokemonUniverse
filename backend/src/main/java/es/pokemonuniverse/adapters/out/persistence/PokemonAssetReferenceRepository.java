package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.model.Sort;
import io.micronaut.data.repository.CrudRepository;
import java.util.Collection;
import java.util.List;

@Repository
public interface PokemonAssetReferenceRepository extends CrudRepository<PokemonAssetReferenceEntity, String> {

  List<PokemonAssetReferenceEntity> findByKindIn(Collection<String> kinds, Sort sort);
}

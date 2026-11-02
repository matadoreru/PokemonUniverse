package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.util.Optional;

@Repository
public interface CustomCategoryRepository extends CrudRepository<CustomCategoryEntity, String> {

  Optional<CustomCategoryEntity> findByIdAndUserId(String id, String userId);

  long deleteByIdAndUserId(String id, String userId);
}

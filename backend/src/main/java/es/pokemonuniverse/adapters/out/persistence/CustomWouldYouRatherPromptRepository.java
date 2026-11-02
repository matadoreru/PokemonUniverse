package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.util.Optional;

@Repository
public interface CustomWouldYouRatherPromptRepository extends CrudRepository<CustomWouldYouRatherPromptEntity, String> {

  Optional<CustomWouldYouRatherPromptEntity> findByIdAndUserId(String id, String userId);

  long deleteByIdAndUserId(String id, String userId);

  long countByUserIdAndNormalizedKey(String userId, String normalizedKey);
}

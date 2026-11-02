package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.util.Optional;

@Repository
public interface UserGameConfigRepository extends CrudRepository<UserGameConfigEntity, String> {

  Optional<UserGameConfigEntity> findByUserIdAndGameId(String userId, String gameId);
}

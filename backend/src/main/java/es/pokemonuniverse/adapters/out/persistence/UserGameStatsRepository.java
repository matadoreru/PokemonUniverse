package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;

@Repository
public interface UserGameStatsRepository extends CrudRepository<UserGameStatsEntity, String> {

  List<UserGameStatsEntity> findByUserId(String userId);
}

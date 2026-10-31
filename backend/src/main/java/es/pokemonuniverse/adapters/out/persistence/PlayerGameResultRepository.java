package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;

@Repository
public interface PlayerGameResultRepository extends CrudRepository<PlayerGameResultEntity, String> {

  List<PlayerGameResultEntity> findByHistoryId(String historyId);
}

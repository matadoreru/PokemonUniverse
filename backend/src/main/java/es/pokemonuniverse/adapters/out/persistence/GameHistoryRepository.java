package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;
import java.util.Optional;

@Repository
public interface GameHistoryRepository extends CrudRepository<GameHistoryEntity, String> {

  Optional<GameHistoryEntity> findByResultId(String resultId);

  List<GameHistoryEntity> findByRoomHistoryId(String roomHistoryId);
}

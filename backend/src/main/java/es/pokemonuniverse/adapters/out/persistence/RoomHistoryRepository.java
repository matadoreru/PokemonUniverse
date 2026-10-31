package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;

@Repository
public interface RoomHistoryRepository extends CrudRepository<RoomHistoryEntity, String> {}

package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.datasync.DataSyncSource;
import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;

@Repository
public interface DataSyncStateRepository extends CrudRepository<DataSyncStateEntity, DataSyncSource> {}

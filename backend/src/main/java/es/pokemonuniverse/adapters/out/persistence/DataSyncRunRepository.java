package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.datasync.DataSyncStatus;
import io.micronaut.data.annotation.Repository;
import io.micronaut.data.model.Pageable;
import io.micronaut.data.repository.CrudRepository;
import java.util.Collection;
import java.util.List;

@Repository
public interface DataSyncRunRepository extends CrudRepository<DataSyncRunEntity, String> {

  /** Ejecuciones con alguno de los estados, de la más reciente a la más antigua ({@code createdAt desc}). */
  List<DataSyncRunEntity> findByStatusInOrderByCreatedAtDesc(Collection<DataSyncStatus> statuses, Pageable page);
}

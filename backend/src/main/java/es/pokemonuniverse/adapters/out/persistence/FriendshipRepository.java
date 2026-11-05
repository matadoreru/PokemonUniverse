package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Query;
import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;
import java.util.Optional;

@Repository
public interface FriendshipRepository extends CrudRepository<FriendshipEntity, String> {

  /** La fila de la pareja, la pidiera quien la pidiera. */
  @Query("SELECT f FROM FriendshipEntity f WHERE (f.requesterId = :a AND f.addresseeId = :b)"
      + " OR (f.requesterId = :b AND f.addresseeId = :a)")
  Optional<FriendshipEntity> findPair(String a, String b);

  /** Amistades y solicitudes, enviadas o recibidas, de la cuenta. */
  @Query("SELECT f FROM FriendshipEntity f WHERE f.requesterId = :userId OR f.addresseeId = :userId")
  List<FriendshipEntity> findAllInvolving(String userId);

  @Query("SELECT COUNT(f) FROM FriendshipEntity f WHERE f.status = 'ACCEPTED'"
      + " AND (f.requesterId = :userId OR f.addresseeId = :userId)")
  long countAccepted(String userId);

  @Query("SELECT COUNT(f) FROM FriendshipEntity f WHERE f.status = 'PENDING' AND f.requesterId = :userId")
  long countPendingSentBy(String userId);
}

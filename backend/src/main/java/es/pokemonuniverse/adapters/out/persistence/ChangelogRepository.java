package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Query;
import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ChangelogRepository extends CrudRepository<ChangelogEntity, String> {

  List<ChangelogEntity> findByPublishedTrueOrderByDateDescAndCreatedAtDesc();

  /** Todas, publicadas o no (lista de administración). */
  @Query("SELECT c FROM ChangelogEntity c ORDER BY c.date DESC, c.createdAt DESC")
  List<ChangelogEntity> listAll();

  Optional<ChangelogEntity> findByVersion(String version);

  /** {@code deleteMany({where: {id}})}: devuelve las filas borradas. */
  @Query("DELETE FROM ChangelogEntity c WHERE c.id = :id")
  int deleteEntry(String id);
}

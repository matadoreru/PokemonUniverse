package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;

@Repository
public interface ChangelogRepository extends CrudRepository<ChangelogEntity, String> {

  List<ChangelogEntity> findByPublishedTrueOrderByDateDescAndCreatedAtDesc();
}

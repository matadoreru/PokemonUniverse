package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.util.List;

/** Solo lecturas: las altas van por {@link UserAchievementInserts} (ON CONFLICT DO NOTHING). */
@Repository
public interface UserAchievementRepository extends CrudRepository<UserAchievementEntity, UserAchievementId> {

  List<UserAchievementEntity> findByUserId(String userId);
}

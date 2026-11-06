package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Id;
import io.micronaut.data.annotation.Query;
import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.GenericRepository;
import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface DailyChallengeRepository extends GenericRepository<DailyChallengeEntity, LocalDate> {

  /** Guarda el reto del día solo si no existe: ante una carrera, gana la primera fila y se conserva. */
  @Query(value = "INSERT INTO \"DailyChallenge\" (\"date\", \"gameId\", \"pokemonIds\", \"catalogFingerprint\")"
      + " VALUES (:date, :gameId, CAST(:pokemonIdsJson AS jsonb), :fingerprint) ON CONFLICT (\"date\") DO NOTHING",
      nativeQuery = true)
  void insertIfAbsent(LocalDate date, String gameId, String pokemonIdsJson, String fingerprint);

  Optional<DailyChallengeEntity> findById(@Id LocalDate date);
}

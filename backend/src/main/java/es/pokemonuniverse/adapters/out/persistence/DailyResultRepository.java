package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Query;
import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface DailyResultRepository extends CrudRepository<DailyResultEntity, String> {

  /**
   * Guarda el intento como {@code STARTED} salvo que la cuenta ya tenga uno ese día (índice único cuenta + fecha).
   * Devuelve las filas insertadas: {@code 0} significa que ya jugó, sin error de SQL ni aviso en el log.
   */
  @Query(value = "INSERT INTO \"DailyResult\" (\"id\", \"userId\", \"date\", \"gameId\", \"status\", \"startedAt\")"
      + " VALUES (:id, :userId, :date, :gameId, 'STARTED', :now) ON CONFLICT (\"userId\", \"date\") DO NOTHING",
      nativeQuery = true)
  int insertStarted(String id, String userId, LocalDate date, String gameId, Instant now);

  /** Cierra el intento con su puntuación; solo desde {@code STARTED}. Devuelve las filas tocadas (0 o 1). */
  @Query(value = "UPDATE \"DailyResult\" SET \"status\" = 'FINISHED', \"score\" = :score, \"correct\" = :correct,"
      + " \"rounds\" = CAST(:roundsJson AS jsonb), \"finishedAt\" = :now WHERE \"id\" = :id AND \"status\" = 'STARTED'",
      nativeQuery = true)
  int finish(String id, int score, int correct, String roundsJson, Instant now);

  /** Marca el intento como abandonado; solo desde {@code STARTED}, así un resultado terminado no se pierde. */
  @Query(value = "UPDATE \"DailyResult\" SET \"status\" = 'ABANDONED', \"finishedAt\" = :now"
      + " WHERE \"id\" = :id AND \"status\" = 'STARTED'", nativeQuery = true)
  int abandon(String id, Instant now);

  @Query(value = "DELETE FROM \"DailyResult\" WHERE \"id\" = :id AND \"status\" = 'STARTED'", nativeQuery = true)
  void deleteStarted(String id);

  /** Como mucho una fila, por el índice único (cuenta, fecha). */
  Optional<DailyResultEntity> findByUserIdAndDate(String userId, LocalDate date);

  /** Clasificación del día: mayor puntuación primero y, a igualdad, quien terminó antes. */
  @Query(value = "SELECT * FROM \"DailyResult\" WHERE \"date\" = :date AND \"status\" = 'FINISHED'"
      + " ORDER BY \"score\" DESC, \"finishedAt\" ASC LIMIT :limit", nativeQuery = true)
  List<DailyResultEntity> topFinished(LocalDate date, int limit);

  @Query(value = "SELECT COUNT(*) FROM \"DailyResult\" WHERE \"date\" = :date AND \"status\" = 'FINISHED'",
      nativeQuery = true)
  long countFinished(LocalDate date);

  /** Resultados terminados con más puntos: el puesto de una puntuación es {@code 1 + n}. */
  @Query(value = "SELECT COUNT(*) FROM \"DailyResult\" WHERE \"date\" = :date AND \"status\" = 'FINISHED'"
      + " AND \"score\" > :score", nativeQuery = true)
  long countFinishedAbove(LocalDate date, int score);
}

package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.data.annotation.Query;
import io.micronaut.data.annotation.Repository;
import io.micronaut.data.repository.CrudRepository;
import java.time.Instant;
import java.util.Optional;

@Repository
public interface PasswordResetTokenRepository extends CrudRepository<PasswordResetTokenEntity, String> {

  /**
   * Busca por hash bloqueando la fila hasta el fin de la transacción, para que dos envíos a la vez no gasten el mismo
   * token. Hay que llamarlo dentro de una transacción.
   */
  @Query(value = "SELECT * FROM \"PasswordResetToken\" WHERE \"tokenHash\" = :tokenHash FOR UPDATE", nativeQuery = true)
  Optional<PasswordResetTokenEntity> findByTokenHashForUpdate(String tokenHash);

  /** Marca como usados los tokens aún abiertos de la cuenta; devuelve cuántos eran. */
  @Query("UPDATE PasswordResetTokenEntity t SET t.usedAt = :now WHERE t.userId = :userId AND t.usedAt IS NULL")
  int invalidateUnused(String userId, Instant now);

  /** Creación del último token de la cuenta (para limitar los correos por minuto). */
  @Query("SELECT MAX(t.createdAt) FROM PasswordResetTokenEntity t WHERE t.userId = :userId")
  Optional<Instant> findLatestCreatedAt(String userId);
}

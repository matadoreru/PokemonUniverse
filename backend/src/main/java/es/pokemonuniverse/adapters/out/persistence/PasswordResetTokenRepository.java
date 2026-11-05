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

  /**
   * Dueño del token, sin cargar ni bloquear la fila: sirve para bloquear primero al usuario (el mismo orden que al emitir
   * un enlace) y luego el token. Devuelve solo el id para no dejar la entidad en la sesión con datos sin bloquear.
   */
  @Query("SELECT t.userId FROM PasswordResetTokenEntity t WHERE t.tokenHash = :tokenHash")
  Optional<String> findUserIdByTokenHash(String tokenHash);

  /** Marca como usados los tokens aún abiertos de la cuenta; devuelve cuántos eran. */
  @Query("UPDATE PasswordResetTokenEntity t SET t.usedAt = :now WHERE t.userId = :userId AND t.usedAt IS NULL")
  int invalidateUnused(String userId, Instant now);

  /** Creación del último token de la cuenta (para limitar los correos por minuto). */
  @Query("SELECT MAX(t.createdAt) FROM PasswordResetTokenEntity t WHERE t.userId = :userId")
  Optional<Instant> findLatestCreatedAt(String userId);
}

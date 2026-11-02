package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.wouldyourather.StoredWouldYouRatherPrompt;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptStore;
import es.pokemonuniverse.domain.content.WouldYouRatherPromptKey;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.transaction.annotation.Transactional;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.Optional;
import javax.sql.DataSource;

/**
 * Cuerpo de la transacción {@code SERIALIZABLE} de {@code PrismaWouldYouRatherPromptRepository.update}. Es un bean
 * aparte para que {@link JpaWouldYouRatherPromptStore} reintente desde fuera: un fallo de serialización puede llegar
 * en el COMMIT, después de que el método haya vuelto. Como en {@link RoomHistoryWriter}, {@code SET TRANSACTION} va
 * como primera sentencia porque el gestor de Hibernate no admite {@code isolation} en {@code @Transactional}.
 */
@Singleton
@Requires(beans = DataSource.class)
public class WouldYouRatherPromptWriter {

  private final CustomWouldYouRatherPromptRepository repository;
  private final EntityManager entityManager;

  public WouldYouRatherPromptWriter(CustomWouldYouRatherPromptRepository repository, EntityManager entityManager) {
    this.repository = repository;
    this.entityManager = entityManager;
  }

  /** Relee la fila, fusiona, recalcula la clave y comprueba que las opciones difieren; vuelca antes de terminar. */
  @Transactional
  public Optional<StoredWouldYouRatherPrompt> update(String userId, String id, @Nullable String optionA,
      @Nullable String optionB, @Nullable Boolean enabled, Instant now) {
    entityManager.createNativeQuery(RoomHistoryWriter.SERIALIZABLE).executeUpdate();
    var found = repository.findByIdAndUserId(id, userId);
    if (found.isEmpty()) return Optional.empty();
    var entity = found.get();
    var mergedA = optionA == null ? entity.getOptionA() : optionA;
    var mergedB = optionB == null ? entity.getOptionB() : optionB;
    if (WouldYouRatherPromptKey.sameOptions(mergedA, mergedB)) throw new WouldYouRatherPromptStore.SameOptionsException();
    entity.changeOptions(mergedA, mergedB, WouldYouRatherPromptKey.of(mergedA, mergedB));
    if (enabled != null) entity.changeEnabled(enabled);
    entity.touch(now);
    entityManager.flush();
    return Optional.of(entity.toStored());
  }
}

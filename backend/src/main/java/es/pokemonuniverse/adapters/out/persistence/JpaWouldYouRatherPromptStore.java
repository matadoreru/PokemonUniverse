package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.wouldyourather.StoredWouldYouRatherPrompt;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptStore;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.data.exceptions.DataAccessException;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import jakarta.transaction.Transactional;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.StreamSupport;
import javax.sql.DataSource;

/**
 * {@code PrismaWouldYouRatherPromptRepository} sobre JPA.
 * <ul>
 *   <li>{@link #createAll}: una transacción con todas las filas ({@code $transaction} de creates), volcada antes de
 *   terminar para traducir aquí la unicidad ({@code 23505}, P2002) a {@link DuplicateException}.</li>
 *   <li>{@link #update}: transacción {@code SERIALIZABLE} en {@link WouldYouRatherPromptWriter}, hasta 3 intentos
 *   ante un fallo de serialización o interbloqueo ({@code 40001}/{@code 40P01}, el P2034 de Prisma); el tercero se
 *   propaga. Una violación de unicidad es un duplicado inmediato, sin reintento, como en Node.</li>
 * </ul>
 */
@Singleton
@Requires(beans = DataSource.class)
public class JpaWouldYouRatherPromptStore implements WouldYouRatherPromptStore {

  static final int MAX_UPDATE_ATTEMPTS = 3;
  private static final Set<String> SERIALIZATION_FAILURES = Set.of("40001", "40P01");

  private final CustomWouldYouRatherPromptRepository repository;
  private final WouldYouRatherPromptWriter writer;
  private final EntityManager entityManager;

  /** {@code migrations}: como en {@link JpaCustomCategoryStore}, el esquema está migrado antes de la carga inicial. */
  public JpaWouldYouRatherPromptStore(@Nullable FlywayMigrations migrations, CustomWouldYouRatherPromptRepository repository,
      WouldYouRatherPromptWriter writer, EntityManager entityManager) {
    this.repository = repository;
    this.writer = writer;
    this.entityManager = entityManager;
  }

  @Override
  @Transactional
  public List<StoredWouldYouRatherPrompt> findAll() {
    return StreamSupport.stream(repository.findAll().spliterator(), false)
        .map(CustomWouldYouRatherPromptEntity::toStored)
        .toList();
  }

  @Override
  @Transactional
  public List<StoredWouldYouRatherPrompt> createAll(String userId, List<NewPrompt> prompts, Instant now) {
    var entities = new ArrayList<CustomWouldYouRatherPromptEntity>();
    try {
      for (var prompt : prompts) {
        var entity = CustomWouldYouRatherPromptEntity.create(prompt.id(), userId, prompt.optionA(), prompt.optionB(),
            prompt.normalizedKey(), now);
        entityManager.persist(entity);
        entities.add(entity);
      }
      entityManager.flush();
    } catch (DataAccessException | PersistenceException e) {
      if (JpaCustomCategoryStore.isUniqueViolation(e)) throw new DuplicateException(e);
      throw e;
    }
    return entities.stream().map(CustomWouldYouRatherPromptEntity::toStored).toList();
  }

  @Override
  public Optional<StoredWouldYouRatherPrompt> update(String userId, String id, @Nullable String optionA,
      @Nullable String optionB, @Nullable Boolean enabled, Instant now) {
    return retrying(() -> writer.update(userId, id, optionA, optionB, enabled, now));
  }

  @Override
  @Transactional
  public boolean delete(String userId, String id) {
    return repository.deleteByIdAndUserId(id, userId) > 0;
  }

  /** Bucle de reintentos de {@code update}, fuera de la transacción para cubrir también los fallos del COMMIT. */
  static <T> T retrying(Supplier<T> attempt) {
    for (int number = 1; ; number += 1) {
      try {
        return attempt.get();
      } catch (DuplicateException | SameOptionsException e) {
        throw e;
      } catch (RuntimeException e) {
        if (JpaCustomCategoryStore.isUniqueViolation(e)) throw new DuplicateException(e);
        if (!isSerializationFailure(e) || number == MAX_UPDATE_ATTEMPTS) throw e;
      }
    }
  }

  private static boolean isSerializationFailure(Throwable error) {
    for (Throwable cause = error; cause != null; cause = cause.getCause()) {
      if (cause instanceof SQLException sql && SERIALIZATION_FAILURES.contains(sql.getSQLState())) return true;
      if (cause instanceof org.hibernate.JDBCException jdbc && SERIALIZATION_FAILURES.contains(jdbc.getSQLState())) {
        return true;
      }
      if (cause.getCause() == cause) break;
    }
    return false;
  }
}

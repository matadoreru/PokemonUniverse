package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.categories.CustomCategoryStore;
import es.pokemonuniverse.application.categories.StoredCustomCategory;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.data.exceptions.DataAccessException;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import jakarta.transaction.Transactional;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.StreamSupport;
import javax.sql.DataSource;

/**
 * {@code PrismaCustomCategoryRepository} sobre JPA. Cada operación es una transacción que se vuelca antes de
 * terminar, para traducir aquí la violación de unicidad ({@code 23505}, P2002) y que la caché del servicio solo se
 * actualice tras el commit.
 */
@Singleton
@Requires(beans = DataSource.class)
public class JpaCustomCategoryStore implements CustomCategoryStore {

  private static final String UNIQUE_VIOLATION = "23505";

  private final CustomCategoryRepository repository;
  private final EntityManager entityManager;

  /**
   * {@code guard} fuerza el orden fuera de test: el esquema está comprobado y migrado antes de la carga inicial (en
   * test no existe; Flyway de Micronaut migra antes de crear beans de datos).
   */
  public JpaCustomCategoryStore(@Nullable PrismaSchemaGuard guard, CustomCategoryRepository repository,
      EntityManager entityManager) {
    this.repository = repository;
    this.entityManager = entityManager;
  }

  @Override
  @Transactional
  public List<StoredCustomCategory> findAll() {
    return StreamSupport.stream(repository.findAll().spliterator(), false)
        .map(CustomCategoryEntity::toStored)
        .toList();
  }

  @Override
  @Transactional
  public StoredCustomCategory create(String id, String userId, String text, String normalizedText, Instant now) {
    var entity = CustomCategoryEntity.create(id, userId, text, normalizedText, now);
    try {
      entityManager.persist(entity);
      entityManager.flush();
    } catch (DataAccessException | PersistenceException e) {
      if (isUniqueViolation(e)) throw new DuplicateException(e);
      throw e;
    }
    return entity.toStored();
  }

  @Override
  @Transactional
  public Optional<StoredCustomCategory> update(String userId, String id, @Nullable String text,
      @Nullable String normalizedText, @Nullable Boolean enabled, Instant now) {
    var found = repository.findByIdAndUserId(id, userId);
    if (found.isEmpty()) return Optional.empty();
    var entity = found.get();
    if (text != null && normalizedText != null) entity.changeText(text, normalizedText);
    if (enabled != null) entity.changeEnabled(enabled);
    entity.touch(now);
    try {
      entityManager.flush();
    } catch (DataAccessException | PersistenceException e) {
      if (isUniqueViolation(e)) throw new DuplicateException(e);
      throw e;
    }
    return Optional.of(entity.toStored());
  }

  @Override
  @Transactional
  public boolean delete(String userId, String id) {
    return repository.deleteByIdAndUserId(id, userId) > 0;
  }

  static boolean isUniqueViolation(Throwable error) {
    for (Throwable cause = error; cause != null; cause = cause.getCause()) {
      if (cause instanceof SQLException sql && UNIQUE_VIOLATION.equals(sql.getSQLState())) return true;
      if (cause instanceof org.hibernate.JDBCException jdbc && UNIQUE_VIOLATION.equals(jdbc.getSQLState())) return true;
      if (cause.getCause() == cause) break;
    }
    return false;
  }
}

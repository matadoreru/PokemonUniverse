package es.pokemonuniverse.application.categories;

import io.micronaut.core.annotation.Nullable;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Puerto de persistencia de las categorías personalizadas ({@code CustomCategoryRepository} de Node). La unicidad
 * {@code (userId, normalizedText)} de la BD respalda la comprobación de la caché: una violación se lanza como
 * {@link DuplicateException}.
 */
public interface CustomCategoryStore {

  List<StoredCustomCategory> findAll();

  StoredCustomCategory create(String id, String userId, String text, String normalizedText, Instant now);

  /**
   * Cambia solo los campos no nulos ({@code text} y {@code normalizedText} van juntos) y fija {@code updatedAt};
   * vacío si la categoría no existe o es de otro usuario.
   */
  Optional<StoredCustomCategory> update(String userId, String id, @Nullable String text,
      @Nullable String normalizedText, @Nullable Boolean enabled, Instant now);

  /** {@code false} si la categoría no existe o es de otro usuario. */
  boolean delete(String userId, String id);

  /** La BD rechazó la fila por la unicidad {@code (userId, normalizedText)} (P2002 / {@code 23505}). */
  final class DuplicateException extends RuntimeException {
    public DuplicateException(Throwable cause) {
      super("Duplicate custom category", cause);
    }
  }
}

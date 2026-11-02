package es.pokemonuniverse.application.wouldyourather;

import io.micronaut.core.annotation.Nullable;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Puerto de persistencia de los dilemas ({@code WouldYouRatherPromptRepository} de Node). La unicidad
 * {@code (userId, normalizedKey)} de la BD respalda la comprobación de la caché: una violación se lanza como
 * {@link DuplicateException}.
 */
public interface WouldYouRatherPromptStore {

  List<StoredWouldYouRatherPrompt> findAll();

  /** Inserta todas las filas en una sola transacción: o todas o ninguna ({@code createBatch}). */
  List<StoredWouldYouRatherPrompt> createAll(String userId, List<NewPrompt> prompts, Instant now);

  /**
   * Transacción {@code SERIALIZABLE} con hasta 3 intentos ante un fallo de serialización: relee la fila, fusiona las
   * opciones no nulas con las guardadas, recalcula {@code normalizedKey}, vuelve a comprobar que difieren
   * ({@link SameOptionsException}) y fija {@code updatedAt}. Vacío si no existe o es de otro usuario.
   */
  Optional<StoredWouldYouRatherPrompt> update(String userId, String id, @Nullable String optionA,
      @Nullable String optionB, @Nullable Boolean enabled, Instant now);

  /** {@code false} si el dilema no existe o es de otro usuario. */
  boolean delete(String userId, String id);

  record NewPrompt(String id, String optionA, String optionB, String normalizedKey) {}

  /** La BD rechazó la fila por la unicidad {@code (userId, normalizedKey)} (P2002 / {@code 23505}). */
  final class DuplicateException extends RuntimeException {
    public DuplicateException(@Nullable Throwable cause) {
      super("Duplicate would-you-rather prompt", cause);
    }
  }

  /** Las opciones fusionadas dentro de la transacción quedaron iguales ({@code InvalidWouldYouRatherPromptError}). */
  final class SameOptionsException extends RuntimeException {
    public SameOptionsException() {
      super("Would-you-rather options are equal");
    }
  }
}

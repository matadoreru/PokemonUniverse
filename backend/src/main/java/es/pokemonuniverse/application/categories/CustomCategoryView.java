package es.pokemonuniverse.application.categories;

import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.serde.annotation.Serdeable;

/** Vista pública de una categoría ({@code CustomCategoryView} de {@code packages/shared}); fechas ISO con milisegundos. */
@Serdeable
public record CustomCategoryView(String id, String text, boolean enabled, String createdAt, String updatedAt) {

  static CustomCategoryView of(StoredCustomCategory category) {
    return new CustomCategoryView(category.id(), category.text(), category.enabled(),
        IsoTimestamps.millis(category.createdAt()), IsoTimestamps.millis(category.updatedAt()));
  }
}

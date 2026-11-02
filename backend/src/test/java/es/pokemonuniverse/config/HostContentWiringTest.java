package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.adapters.out.persistence.JpaCustomCategoryStore;
import es.pokemonuniverse.application.categories.CustomCategoryService;
import es.pokemonuniverse.application.categories.CustomCategoryStore;
import es.pokemonuniverse.application.categories.StoredCustomCategory;
import es.pokemonuniverse.application.rooms.HostContentProvider;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** La caché de categorías se carga al arrancar y el {@link HostContentProvider} de las salas la consulta. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "HostContentWiringTest")
class HostContentWiringTest {

  @Singleton
  @Requires(property = "spec.name", value = "HostContentWiringTest")
  @Replaces(JpaCustomCategoryStore.class)
  static class FixedStore implements CustomCategoryStore {
    @Override
    public List<StoredCustomCategory> findAll() {
      return List.of(
          new StoredCustomCategory("c1", "u1", "Activa", "activa", true, Instant.EPOCH, Instant.EPOCH),
          new StoredCustomCategory("c2", "u1", "Apagada", "apagada", false, Instant.EPOCH, Instant.EPOCH));
    }

    @Override
    public StoredCustomCategory create(String id, String userId, String text, String normalizedText, Instant now) {
      throw new UnsupportedOperationException();
    }

    @Override
    public Optional<StoredCustomCategory> update(String userId, String id, @Nullable String text,
        @Nullable String normalizedText, @Nullable Boolean enabled, Instant now) {
      throw new UnsupportedOperationException();
    }

    @Override
    public boolean delete(String userId, String id) {
      throw new UnsupportedOperationException();
    }
  }

  @Inject CustomCategoryService categories;
  @Inject HostContentProvider hostContent;

  @Test
  void loadsAtStartupAndFeedsTheRooms() {
    assertEquals(2, categories.list("u1").size());
    assertEquals(List.of(new SubjectiveCategory("c1", "Activa")), hostContent.customCategoriesForUser("u1"));
    assertEquals(List.of(), hostContent.wouldYouRatherPromptsForUser("u1"));
  }
}

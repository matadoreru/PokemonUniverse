package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.adapters.out.persistence.JpaCustomCategoryStore;
import es.pokemonuniverse.adapters.out.persistence.JpaWouldYouRatherPromptStore;
import es.pokemonuniverse.application.categories.CustomCategoryService;
import es.pokemonuniverse.application.categories.CustomCategoryStore;
import es.pokemonuniverse.application.categories.StoredCustomCategory;
import es.pokemonuniverse.application.rooms.HostContentProvider;
import es.pokemonuniverse.application.wouldyourather.StoredWouldYouRatherPrompt;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptService;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptStore;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
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

/** Las cachés de categorías y dilemas se cargan al arrancar y el {@link HostContentProvider} de las salas las consulta. */
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

  @Singleton
  @Requires(property = "spec.name", value = "HostContentWiringTest")
  @Replaces(JpaWouldYouRatherPromptStore.class)
  static class FixedPrompts implements WouldYouRatherPromptStore {
    @Override
    public List<StoredWouldYouRatherPrompt> findAll() {
      return List.of(
          new StoredWouldYouRatherPrompt("w1", "u1", "Vivir con Gengar", "Viajar con Magikarp", "k1", true,
              Instant.EPOCH, Instant.EPOCH),
          new StoredWouldYouRatherPrompt("w2", "u1", "Elegir a Eevee", "Elegir a Mew", "k2", false, Instant.EPOCH,
              Instant.EPOCH));
    }

    @Override
    public List<StoredWouldYouRatherPrompt> createAll(String userId, List<NewPrompt> prompts, Instant now) {
      throw new UnsupportedOperationException();
    }

    @Override
    public Optional<StoredWouldYouRatherPrompt> update(String userId, String id, @Nullable String optionA,
        @Nullable String optionB, @Nullable Boolean enabled, Instant now) {
      throw new UnsupportedOperationException();
    }

    @Override
    public boolean delete(String userId, String id) {
      throw new UnsupportedOperationException();
    }
  }

  @Inject CustomCategoryService categories;
  @Inject WouldYouRatherPromptService prompts;
  @Inject HostContentProvider hostContent;

  @Test
  void loadsAtStartupAndFeedsTheRooms() {
    assertEquals(2, categories.list("u1").size());
    assertEquals(List.of(new SubjectiveCategory("c1", "Activa")), hostContent.customCategoriesForUser("u1"));
    assertEquals(2, prompts.list("u1").size());
    assertEquals(List.of(new WouldYouRatherPromptPair("w1", "Vivir con Gengar", "Viajar con Magikarp")),
        hostContent.wouldYouRatherPromptsForUser("u1"));
  }
}

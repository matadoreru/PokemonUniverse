package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.gameconfigs.UserGameConfigService;
import es.pokemonuniverse.application.rooms.UserGameConfigPreferences;
import io.micronaut.context.BeanContext;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

/** Con BD, las salas usan las preferencias persistidas y el arranque las carga. */
@MicronautTest(transactional = false)
class UserGameConfigWiringTest {

  @Inject UserGameConfigPreferences preferences;
  @Inject BeanContext context;

  @Test
  void roomsUseThePersistedPreferencesLoadedAtStartup() {
    assertInstanceOf(UserGameConfigService.class, preferences);
    assertTrue(context.findBean(UserGameConfigLoader.class).isPresent());
  }
}

package es.pokemonuniverse.config;

import es.pokemonuniverse.application.categories.CustomCategoryService;
import es.pokemonuniverse.application.rooms.HostContentProvider;
import es.pokemonuniverse.application.rooms.RoomSettings;
import es.pokemonuniverse.application.rooms.UserGameConfigPreferences;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptService;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Secondary;
import jakarta.inject.Singleton;
import java.util.List;

/**
 * Beans de sala: ajustes desde {@link PuConfig}, contenido personal del host (categorías de
 * {@link CustomCategoryService} y dilemas de {@link WouldYouRatherPromptService}) y el puerto que la 2C aún sustituirá
 * (preferencias de configuración por usuario), marcados {@code @Secondary} para que las pruebas los reemplacen.
 */
@Factory
public class RoomBeans {

  @Singleton
  RoomSettings roomSettings(PuConfig config) {
    return new RoomSettings(config.roomMaxPlayers(), config.reconnectGraceMs());
  }

  @Singleton
  @Secondary
  UserGameConfigPreferences userGameConfigPreferences() {
    return UserGameConfigPreferences.NO_OP;
  }

  @Singleton
  @Secondary
  HostContentProvider hostContentProvider(CustomCategoryService categories, WouldYouRatherPromptService prompts) {
    return new HostContentProvider() {
      @Override
      public List<SubjectiveCategory> customCategoriesForUser(String userId) {
        return categories.enabled(userId);
      }

      @Override
      public List<WouldYouRatherPromptPair> wouldYouRatherPromptsForUser(String userId) {
        return prompts.enabled(userId);
      }
    };
  }
}

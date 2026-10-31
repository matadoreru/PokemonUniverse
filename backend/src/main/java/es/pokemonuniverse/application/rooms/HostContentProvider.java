package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import java.util.List;

/**
 * Contenido personal del host ({@code customCategoriesForUser}, {@code wouldYouRatherPromptsForUser}). Vacío en la
 * etapa 2A; la 2C lo conecta a sus tablas.
 */
public interface HostContentProvider {

  List<SubjectiveCategory> customCategoriesForUser(String userId);

  List<WouldYouRatherPromptPair> wouldYouRatherPromptsForUser(String userId);

  HostContentProvider EMPTY = new HostContentProvider() {
    @Override
    public List<SubjectiveCategory> customCategoriesForUser(String userId) {
      return List.of();
    }

    @Override
    public List<WouldYouRatherPromptPair> wouldYouRatherPromptsForUser(String userId) {
      return List.of();
    }
  };
}

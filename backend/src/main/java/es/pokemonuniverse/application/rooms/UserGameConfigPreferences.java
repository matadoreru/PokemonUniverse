package es.pokemonuniverse.application.rooms;

import io.micronaut.json.tree.JsonNode;
import java.util.Map;

/**
 * Configuraciones guardadas por usuario ({@code game-configs/service.ts}). En la etapa 2A no hay almacenamiento: la
 * implementación por defecto no lee ni guarda nada (la 2C conecta la tabla {@code UserGameConfig}).
 */
public interface UserGameConfigPreferences {

  Map<String, JsonNode> forUser(String userId);

  void save(String userId, String gameId, JsonNode config);

  UserGameConfigPreferences NO_OP = new UserGameConfigPreferences() {
    @Override
    public Map<String, JsonNode> forUser(String userId) {
      return Map.of();
    }

    @Override
    public void save(String userId, String gameId, JsonNode config) {}
  };
}

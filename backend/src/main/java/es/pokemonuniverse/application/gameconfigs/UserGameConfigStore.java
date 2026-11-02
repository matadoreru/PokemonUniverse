package es.pokemonuniverse.application.gameconfigs;

import io.micronaut.json.tree.JsonNode;
import java.util.List;

/** Puerto de persistencia de las configuraciones por usuario ({@code UserGameConfigRepository} de Node). */
public interface UserGameConfigStore {

  /** Todas las filas, de cualquier juego (también los que ya no existen). */
  List<StoredUserGameConfig> list();

  /** Crea o sustituye la fila única {@code (userId, gameId)}. */
  void upsert(String userId, String gameId, JsonNode config);
}

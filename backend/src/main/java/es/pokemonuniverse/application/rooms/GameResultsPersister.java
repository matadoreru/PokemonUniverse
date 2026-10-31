package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.json.tree.JsonNode;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/** {@code persistGameResults} de {@code stats/service.ts}: idempotente por {@code resultId}. */
public interface GameResultsPersister {

  /** {@code ResultRoomSnapshot}: identidades copiadas al terminar (la sesión puede avanzar antes de persistir). */
  record ResultRoomSnapshot(String historyId, String code, Map<String, AuthUser> members) {
    public ResultRoomSnapshot {
      members = Map.copyOf(members);
    }
  }

  CompletableFuture<Void> persist(ResultRoomSnapshot room, GameResults results, String resultId, long startedAt,
      String gameId, JsonNode config);

  GameResultsPersister NO_OP = (room, results, resultId, startedAt, gameId, config) ->
      CompletableFuture.completedFuture(null);
}

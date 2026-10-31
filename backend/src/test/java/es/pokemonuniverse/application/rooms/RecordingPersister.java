package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.game.engine.GameResults;
import io.micronaut.json.tree.JsonNode;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;

/** {@code persistGameResults} falso. */
final class RecordingPersister implements GameResultsPersister {

  record Call(ResultRoomSnapshot room, GameResults results, String resultId, long startedAt, String gameId,
      JsonNode config) {}

  final List<Call> calls = new CopyOnWriteArrayList<>();

  @Override
  public CompletableFuture<Void> persist(ResultRoomSnapshot room, GameResults results, String resultId, long startedAt,
      String gameId, JsonNode config) {
    calls.add(new Call(room, results, resultId, startedAt, gameId, config));
    return CompletableFuture.completedFuture(null);
  }
}

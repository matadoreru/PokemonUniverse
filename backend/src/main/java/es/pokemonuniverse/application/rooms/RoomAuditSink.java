package es.pokemonuniverse.application.rooms;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.concurrent.CompletableFuture;

/** {@code RoomAuditSink} de {@code admin/audit.ts}: historial de salas y partidas, en orden y asíncrono. */
public interface RoomAuditSink {

  record RoomCreated(String id, String code, @Nullable String hostUserId, String hostDisplayName, int maxPlayers,
      long createdAt) {}

  record RoomClosed(String id, String reason, @Nullable String gameResultId, long endedAt) {}

  record GameStarted(String resultId, String roomHistoryId, String roomCode, String gameId, int playerCount,
      JsonNode config, long startedAt) {}

  record GameAbandoned(String resultId, String reason, long endedAt) {}

  CompletableFuture<Void> roomCreated(RoomCreated input);

  CompletableFuture<Void> roomClosed(RoomClosed input);

  CompletableFuture<Void> gameStarted(GameStarted input);

  CompletableFuture<Void> gameAbandoned(GameAbandoned input);

  /** {@code noOpRoomAuditSink}. */
  RoomAuditSink NO_OP = new RoomAuditSink() {
    @Override
    public CompletableFuture<Void> roomCreated(RoomCreated input) {
      return CompletableFuture.completedFuture(null);
    }

    @Override
    public CompletableFuture<Void> roomClosed(RoomClosed input) {
      return CompletableFuture.completedFuture(null);
    }

    @Override
    public CompletableFuture<Void> gameStarted(GameStarted input) {
      return CompletableFuture.completedFuture(null);
    }

    @Override
    public CompletableFuture<Void> gameAbandoned(GameAbandoned input) {
      return CompletableFuture.completedFuture(null);
    }
  };
}

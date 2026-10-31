package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.rooms.RoomAuditSink;
import io.micronaut.core.type.Argument;
import io.micronaut.json.JsonMapper;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * {@code createPrismaRoomAuditSink}: las operaciones se encolan en orden en un único hilo virtual (la cadena de
 * promesas de Node), de modo que el cierre de una sala nunca adelanta a su creación. Un fallo no bloquea la cola.
 */
@Singleton
public class JpaRoomAuditSink implements RoomAuditSink {

  private final RoomHistoryWriter writer;
  private final JsonMapper json;
  private final ExecutorService queue =
      Executors.newSingleThreadExecutor(Thread.ofVirtual().name("room-audit").factory());

  public JpaRoomAuditSink(RoomHistoryWriter writer, JsonMapper json) {
    this.writer = writer;
    this.json = json;
  }

  @Override
  public CompletableFuture<Void> roomCreated(RoomCreated input) {
    return enqueue(() -> writer.roomCreated(input.id(), input.code(), input.hostUserId(), input.hostDisplayName(),
        input.maxPlayers(), Instant.ofEpochMilli(input.createdAt())));
  }

  @Override
  public CompletableFuture<Void> roomClosed(RoomClosed input) {
    return enqueue(() -> writer.roomClosed(input.id(), input.reason(), input.gameResultId(),
        Instant.ofEpochMilli(input.endedAt())));
  }

  @Override
  public CompletableFuture<Void> gameStarted(GameStarted input) {
    return enqueue(() -> writer.gameStarted(input.resultId(), input.roomHistoryId(), input.roomCode(), input.gameId(),
        input.playerCount(), jsonObject(input.config()), Instant.ofEpochMilli(input.startedAt())));
  }

  @Override
  public CompletableFuture<Void> gameAbandoned(GameAbandoned input) {
    return enqueue(() -> writer.gameAbandoned(input.resultId(), Instant.ofEpochMilli(input.endedAt())));
  }

  private CompletableFuture<Void> enqueue(Runnable operation) {
    return CompletableFuture.runAsync(operation, queue);
  }

  private Map<String, Object> jsonObject(io.micronaut.json.tree.JsonNode node) {
    try {
      return json.readValueFromTree(node, Argument.mapOf(String.class, Object.class));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @PreDestroy
  void close() throws InterruptedException {
    queue.shutdown();
    queue.awaitTermination(10, TimeUnit.SECONDS);
  }
}

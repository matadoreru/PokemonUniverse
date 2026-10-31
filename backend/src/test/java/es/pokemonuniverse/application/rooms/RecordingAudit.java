package es.pokemonuniverse.application.rooms;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;

/** Auditoría falsa; {@link #gameStartedResult} permite retrasar el arranque auditado. */
final class RecordingAudit implements RoomAuditSink {

  final List<RoomCreated> created = new CopyOnWriteArrayList<>();
  final List<RoomClosed> closed = new CopyOnWriteArrayList<>();
  final List<GameStarted> started = new CopyOnWriteArrayList<>();
  final List<GameAbandoned> abandoned = new CopyOnWriteArrayList<>();
  volatile CompletableFuture<Void> gameStartedResult;

  @Override
  public CompletableFuture<Void> roomCreated(RoomCreated input) {
    created.add(input);
    return CompletableFuture.completedFuture(null);
  }

  @Override
  public CompletableFuture<Void> roomClosed(RoomClosed input) {
    closed.add(input);
    return CompletableFuture.completedFuture(null);
  }

  @Override
  public CompletableFuture<Void> gameStarted(GameStarted input) {
    started.add(input);
    var result = gameStartedResult;
    return result != null ? result : CompletableFuture.completedFuture(null);
  }

  @Override
  public CompletableFuture<Void> gameAbandoned(GameAbandoned input) {
    abandoned.add(input);
    return CompletableFuture.completedFuture(null);
  }
}

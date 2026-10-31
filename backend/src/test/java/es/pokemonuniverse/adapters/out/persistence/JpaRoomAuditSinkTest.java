package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import es.pokemonuniverse.application.rooms.RoomAuditSink.GameAbandoned;
import es.pokemonuniverse.application.rooms.RoomAuditSink.GameStarted;
import es.pokemonuniverse.application.rooms.RoomAuditSink.RoomClosed;
import es.pokemonuniverse.application.rooms.RoomAuditSink.RoomCreated;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;

/** {@code createPrismaRoomAuditSink} e {@code interruptStaleActivity} contra Postgres real. */
@MicronautTest(transactional = false)
class JpaRoomAuditSinkTest {

  @Inject JpaRoomAuditSink sink;
  @Inject RoomHistoryWriter writer;
  @Inject RoomHistoryRepository rooms;
  @Inject GameHistoryRepository games;

  private static final JsonNode CONFIG = JsonNode.createObjectNode(Map.of("generations",
      JsonNode.createArrayNode(java.util.List.of(JsonNode.createNumberNode(1)))));

  @Test
  void recordsTheRoomLifecycleInOrder() {
    var roomId = UUID.randomUUID().toString();
    var resultId = UUID.randomUUID().toString();
    var skippedId = UUID.randomUUID().toString();
    // Encoladas sin esperar: la cola única conserva el orden (la creación de la sala precede a sus partidas).
    var created = sink.roomCreated(new RoomCreated(roomId, "ABCDEF", null, "Host", 8, 1_000));
    var skippedStart = sink.gameStarted(new GameStarted(skippedId, roomId, "ABCDEF", "higher-lower", 2, CONFIG, 1_500));
    var skipped = sink.gameAbandoned(new GameAbandoned(skippedId, "SKIPPED", 1_800));
    var started = sink.gameStarted(new GameStarted(resultId, roomId, "ABCDEF", "higher-lower", 2, CONFIG, 2_000));
    var duplicate = sink.gameStarted(new GameStarted(resultId, roomId, "ABCDEF", "pokedex-distance", 9, CONFIG, 9_000));
    var closed = sink.roomClosed(new RoomClosed(roomId, "EMPTY_AFTER_LEAVE", resultId, 3_000));
    CompletableFuture.allOf(created, skippedStart, skipped, started, duplicate, closed).join();

    var room = rooms.findById(roomId).orElseThrow();
    assertEquals(RoomHistoryStatus.CLOSED, room.getStatus());
    assertEquals("EMPTY_AFTER_LEAVE", room.getCloseReason());
    assertEquals(Instant.ofEpochMilli(1_000), room.getCreatedAt());
    assertEquals(Instant.ofEpochMilli(3_000), room.getEndedAt());
    assertNull(room.getHostUserId());
    assertNotNull(room.getUpdatedAt());
    var game = games.findByResultId(resultId).orElseThrow();
    assertEquals(GameHistoryStatus.ABANDONED, game.getStatus());
    assertEquals("higher-lower", game.getGameId());
    assertEquals(2, game.getPlayerCount());
    assertEquals(Instant.ofEpochMilli(3_000), game.getEndedAt());
    var skippedGame = games.findByResultId(skippedId).orElseThrow();
    assertEquals(GameHistoryStatus.ABANDONED, skippedGame.getStatus());
    assertEquals(Instant.ofEpochMilli(1_800), skippedGame.getEndedAt());
    assertEquals(2, games.findByRoomHistoryId(roomId).size());

    sink.roomClosed(new RoomClosed(roomId, "EMPTY_AFTER_TIMEOUT", null, 9_000)).join();
    assertEquals("EMPTY_AFTER_LEAVE", rooms.findById(roomId).orElseThrow().getCloseReason());
  }

  @Test
  void interruptsStaleActivityOnStartup() {
    var activeRoom = UUID.randomUUID().toString();
    var closedRoom = UUID.randomUUID().toString();
    var liveGame = UUID.randomUUID().toString();
    sink.roomCreated(new RoomCreated(activeRoom, "AAAAAA", null, "Host", 8, 1_000)).join();
    sink.roomCreated(new RoomCreated(closedRoom, "BBBBBB", null, "Host", 8, 1_000)).join();
    sink.gameStarted(new GameStarted(liveGame, activeRoom, "AAAAAA", "higher-lower", 1, CONFIG, 1_000)).join();
    sink.roomClosed(new RoomClosed(closedRoom, "EMPTY_AFTER_LEAVE", null, 2_000)).join();

    var now = Instant.ofEpochMilli(Instant.now().toEpochMilli());
    writer.interruptStaleActivity(now);

    var interrupted = rooms.findById(activeRoom).orElseThrow();
    assertEquals(RoomHistoryStatus.INTERRUPTED, interrupted.getStatus());
    assertEquals("SERVER_STOPPED", interrupted.getCloseReason());
    assertEquals(now, interrupted.getEndedAt());
    var game = games.findByResultId(liveGame).orElseThrow();
    assertEquals(GameHistoryStatus.INTERRUPTED, game.getStatus());
    assertEquals(now, game.getEndedAt());
    var untouched = rooms.findById(closedRoom).orElseThrow();
    assertEquals(RoomHistoryStatus.CLOSED, untouched.getStatus());
    assertEquals("EMPTY_AFTER_LEAVE", untouched.getCloseReason());
  }
}

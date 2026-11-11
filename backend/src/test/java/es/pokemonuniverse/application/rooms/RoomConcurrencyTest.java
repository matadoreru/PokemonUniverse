package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.guest;
import static es.pokemonuniverse.application.rooms.RoomTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.RoomPhase;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Review Focus 1 y 2: dos acciones simultáneas de jugadores distintos se serializan con el lock de la sala y un
 * callback de temporizador obsoleto no aplica nada.
 */
class RoomConcurrencyTest {

  private static final List<String> PLAYERS = List.of("p1", "p2", "p3", "p4");

  private static RoomTestKit startFourPlayers(RoomTestKit kit) {
    var room = kit.room(8, guest("p1", "Host"), guest("p2", "Ana"), guest("p3", "Bea"), guest("p4", "Carla"));
    kit.manager.selectGame("p1", "higher-lower");
    kit.manager.updateConfig("p1", json("""
        {"generations":[1,2],"categories":["ATTACK","SPEED"],"showPreviousValue":true,"answerVisibility":"LIVE",
         "difficulty":"NORMAL","roundSeconds":20,"rounds":50}"""));
    kit.startReady(room, "p1");
    return kit;
  }

  /** 200 {@code gameAction} simultáneas (50 por jugador) con la época vigente; devuelve los aceptados. */
  private static List<String> storm(RoomTestKit kit, LiveRoom room, Runnable concurrently) throws Exception {
    var game = room.game;
    var instance = game.resultId;
    var epoch = game.engine.getLifecycle(game.state).actionEpoch();
    var accepted = new CopyOnWriteArrayList<String>();
    var unexpected = new CopyOnWriteArrayList<Throwable>();
    var start = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(16)) {
      var tasks = new ArrayList<Future<?>>();
      for (int index = 0; index < 200; index++) {
        var playerId = PLAYERS.get(index % 4);
        var choice = index % 3 == 0 ? "HIGHER" : index % 3 == 1 ? "LOWER" : "SAME";
        tasks.add(pool.submit(() -> {
          start.await();
          try {
            kit.manager.gameAction(playerId, json("{\"gameInstanceId\":\"" + instance + "\",\"actionEpoch\":"
                + JsonTree.quote(epoch) + ",\"action\":{\"type\":\"ANSWER\",\"choice\":\"" + choice + "\"}}"));
            accepted.add(playerId);
          } catch (RoomException expected) {
            // rechazo de dominio: respuesta bloqueada, época cambiada o ronda inactiva
          } catch (Throwable other) {
            unexpected.add(other);
          }
          return null;
        }));
      }
      if (concurrently != null) {
        tasks.add(pool.submit((Callable<Void>) () -> {
          start.await();
          concurrently.run();
          return null;
        }));
      }
      start.countDown();
      for (var task : tasks) task.get(30, TimeUnit.SECONDS);
    }
    assertEquals(List.of(), unexpected, "solo RoomException puede escapar del coordinador");
    return accepted;
  }

  private static Set<String> answeredIds(RoomTestKit kit, LiveRoom room) {
    var ids = new java.util.HashSet<String>();
    for (var id : kit.publicGame(room, "p1").get("answeredIds").values()) ids.add(id.getStringValue());
    return ids;
  }

  @Test
  @DisplayName("200 concurrent actions from 4 players never lose an accepted answer")
  void concurrentActionsAreSerialized() throws Exception {
    var kit = startFourPlayers(new RoomTestKit());
    var room = kit.manager.store.roomForPlayer("p1");
    for (int round = 1; round <= 5; round++) {
      var accepted = storm(kit, room, null);
      assertEquals(4, accepted.size(), "una respuesta aceptada por jugador");
      assertEquals(Set.copyOf(PLAYERS), Set.copyOf(accepted));
      assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
      assertEquals(Set.copyOf(PLAYERS), answeredIds(kit, room));
      assertEquals(round, kit.publicGame(room, "p1").get("roundNumber").getIntValue());
      kit.passDeadline(room);
      assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    }
    var revisions = new ArrayList<Long>();
    for (var sent : kit.events.named("room:state")) {
      if (sent.memberId().equals("p2")) revisions.add(((RoomView) sent.payload()).revision());
    }
    for (int index = 1; index < revisions.size(); index++) {
      assertTrue(revisions.get(index) > revisions.get(index - 1), "revision monótona por miembro");
    }
  }

  @Test
  @DisplayName("an accepted answer is never lost when the round deadline fires concurrently")
  void deadlineRacingActions() throws Exception {
    for (int attempt = 0; attempt < 5; attempt++) {
      var kit = startFourPlayers(new RoomTestKit());
      var room = kit.manager.store.roomForPlayer("p1");
      var roundTimer = kit.time.lastScheduledTask();
      long deadline = room.game.engine.getLifecycle(room.game.state).nextDeadline();
      var accepted = storm(kit, room, () -> {
        kit.time.set(deadline + RoomCoordinator.DEADLINE_TOLERANCE_MS);
        roundTimer.run();
      });
      assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
      assertEquals(1, kit.publicGame(room, "p1").get("roundNumber").getIntValue());
      assertEquals(Set.copyOf(accepted), answeredIds(kit, room));
      assertEquals(accepted.size(), Set.copyOf(accepted).size());
    }
  }

  /** Planificador que entrega los callbacks al test; cancelar no impide ejecutarlos (ya estaban encolados). */
  private static final class CapturingSchedulers implements RoomSchedulers {
    final List<Runnable> tasks = new CopyOnWriteArrayList<>();
    final AtomicInteger cancelled = new AtomicInteger();

    @Override
    public Runnable schedule(long delayMs, Runnable task) {
      tasks.add(task);
      return cancelled::incrementAndGet;
    }
  }

  @Test
  @DisplayName("a stale timer callback queued before a skip never applies to the replacement game")
  void staleTimerCallbackIsIgnored() throws Exception {
    var time = new ManualTime(50_000);
    var schedulers = new CapturingSchedulers();
    var events = new RecordingEvents();
    var manager = RoomTestKit.coordinator(RoomTestKit.registry(), events, RoomAuditSink.NO_OP,
        GameResultsPersister.NO_OP, UserGameConfigPreferences.NO_OP, HostContentProvider.EMPTY, time,
        new SeededRandom(7), schedulers, RoomSettings.DEFAULTS);
    var room = manager.store.get(manager.create(guest("p1", "Host"), "s1", null).code());
    RoomTestKit.join(manager, guest("p2", "Ana"), "s2", room.code);
    manager.selectGame("p1", "higher-lower");
    manager.updateConfig("p1", json(RoomTestKit.HIGHER_LOWER_1_ROUND));
    // Dos juegos en orden: el salto pasa a Pokédex Distance (con uno solo terminaría la sesión).
    manager.updateGameSelection("p1", json("{\"type\":\"ORDER\",\"gameIds\":[\"higher-lower\",\"pokedex-distance\"]}"));
    RoomTestKit.setReady(manager, "p2", true);
    manager.startGame("p1");
    var staleTimer = schedulers.tasks.getLast();
    var first = room.game;
    for (var id : List.of("p1", "p2")) {
      manager.setGameSkipVote(id, json("{\"gameInstanceId\":\"" + first.resultId + "\",\"wantsToSkip\":true}"));
    }
    var replacement = room.game;
    assertNotEquals(first.resultId, replacement.resultId);
    var replacementState = replacement.state;
    var currentTimer = schedulers.tasks.getLast();
    time.set(replacement.engine.getLifecycle(replacement.state).nextDeadline() + 5);

    var failures = new ConcurrentHashMap<String, Throwable>();
    var stale = Thread.ofVirtual().start(() -> {
      try {
        staleTimer.run();
      } catch (Throwable error) {
        failures.put("stale", error);
      }
    });
    stale.join(5_000);
    assertEquals(0, failures.size());
    assertSame(replacement, room.game);
    assertSame(replacementState, replacement.state);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    assertEquals(0, room.gamesPlayed);

    var current = Thread.ofVirtual().start(currentTimer);
    current.join(5_000);
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    assertSame(replacement, room.game);
    currentTimer.run(); // el mismo callback dos veces: la identidad ya se consumió
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
  }
}

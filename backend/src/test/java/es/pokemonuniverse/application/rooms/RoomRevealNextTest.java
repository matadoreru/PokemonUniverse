package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.answer;
import static es.pokemonuniverse.application.rooms.RoomTestKit.guest;
import static es.pokemonuniverse.application.rooms.RoomTestKit.join;
import static es.pokemonuniverse.application.rooms.RoomTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.MemberRole;
import es.pokemonuniverse.domain.room.RoomPhase;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * «Siguiente» en los revelados (E2): cuando todos los jugadores conectados lo pulsan, el reloj de la sala avanza hasta
 * dejar el plazo del revelado a 1 s. Higher or Lower revela 3 s ({@code REVEAL_MS}) tras cada ronda de 10 s.
 */
class RoomRevealNextTest {

  private static final String HIGHER_LOWER_3_ROUNDS = """
      {"generations":[1],"categories":["ATTACK"],"showPreviousValue":true,"answerVisibility":"LIVE",
       "difficulty":"NORMAL","roundSeconds":10,"rounds":3}""";
  private static final long REVEAL_MS = 3_000;
  private static final long ROUND_MS = 10_000;

  private static RoomTestKit kit() {
    return new RoomTestKit("shiny-vote");
  }

  /** Sala de dos con Higher or Lower de tres rondas, ya en el revelado de la primera (los dos han respondido). */
  private static LiveRoom revealRoom(RoomTestKit kit) {
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.manager.selectGame("host", "higher-lower");
    kit.manager.updateConfig("host", json(HIGHER_LOWER_3_ROUNDS));
    kit.startReady(room, "host");
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    kit.time.advance(2_000);
    kit.manager.action("host", answer("HIGHER"));
    kit.manager.action("guest", answer("LOWER"));
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    return room;
  }

  private static String epoch(LiveRoom room) {
    return room.game.engine.getLifecycle(room.game.state).actionEpoch();
  }

  private static long deadline(LiveRoom room) {
    return room.game.engine.getLifecycle(room.game.state).nextDeadline();
  }

  private static void next(RoomTestKit kit, LiveRoom room, String playerId) {
    next(kit, room, playerId, epoch(room));
  }

  private static void next(RoomTestKit kit, LiveRoom room, String playerId, String epoch) {
    kit.manager.setRevealNext(playerId,
        json("{\"gameInstanceId\":\"" + room.game.resultId + "\",\"actionEpoch\":\"" + epoch.replace("\"", "\\\"")
            + "\"}"));
  }

  private static String rejection(Runnable operation) {
    return assertThrows(RoomException.class, operation::run).getMessage();
  }

  @Test
  @DisplayName("when every player presses next, the reveal ends 1 s later and the next round lasts as usual")
  void everyoneReadyShortensTheReveal() {
    var kit = kit();
    var room = revealRoom(kit);
    long revealDeadline = deadline(room);
    assertEquals(kit.time.now() + REVEAL_MS, revealDeadline);
    var view = kit.manager.view(room, "guest");
    assertEquals(new RoomView.RevealSkipView(List.of("host", "guest"), List.of()), view.revealSkip());
    assertEquals(kit.time.now(), view.serverNow());

    next(kit, room, "host");
    assertEquals(0, room.clockOffsetMs);
    assertEquals(List.of("host"), kit.manager.view(room, "guest").revealSkip().readyPlayerIds());
    next(kit, room, "host"); // repetir no cambia nada
    next(kit, room, "guest");
    // El reloj de la sala avanza 2 s: al revelado le queda 1 s, en la hora de la sala y en la vista.
    assertEquals(REVEAL_MS - RoomCoordinator.REVEAL_NEXT_REMAINING_MS, room.clockOffsetMs);
    assertEquals(revealDeadline, deadline(room));
    assertEquals(revealDeadline - 1_000, kit.manager.view(room, "guest").serverNow());
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);

    kit.time.advance(1_000 + RoomCoordinator.DEADLINE_TOLERANCE_MS - 1);
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    kit.time.advance(1);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    // La ronda 2 dura sus 10 s desde ahora, en la hora de la sala; el desfase sigue igual.
    assertEquals(kit.manager.roomNow(room) + ROUND_MS, deadline(room));
    assertNull(kit.manager.view(room, "guest").revealSkip());
    kit.time.advance(ROUND_MS - 1);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    kit.time.advance(1 + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    assertEquals(REVEAL_MS - RoomCoordinator.REVEAL_NEXT_REMAINING_MS, room.clockOffsetMs);
    // El revelado nuevo empieza sin nadie listo.
    assertEquals(List.of(), kit.manager.view(room, "host").revealSkip().readyPlayerIds());
  }

  @Test
  @DisplayName("the offset only grows: a reveal with less than 1 s left does not move the clock")
  void offsetOnlyGrows() {
    var kit = kit();
    var room = revealRoom(kit);
    kit.time.advance(REVEAL_MS - 500);
    next(kit, room, "host");
    next(kit, room, "guest");
    assertEquals(0, room.clockOffsetMs);
    kit.time.advance(500 + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);

    // Segundo revelado: ahora sí avanza, y el desfase se suma al anterior (aquí, 0).
    kit.time.advance(1_000);
    kit.manager.action("host", answer("HIGHER"));
    kit.manager.action("guest", answer("HIGHER"));
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    next(kit, room, "host");
    next(kit, room, "guest");
    assertEquals(2_000, room.clockOffsetMs);
    kit.time.advance(1_000 + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    kit.time.advance(1_000);
    kit.manager.action("host", answer("HIGHER"));
    kit.manager.action("guest", answer("HIGHER"));
    next(kit, room, "host");
    next(kit, room, "guest");
    assertEquals(4_000, room.clockOffsetMs);
  }

  @Test
  @DisplayName("spectators neither count nor can press next")
  void spectatorsDoNotCount() {
    var kit = kit();
    var room = revealRoom(kit);
    join(kit.manager, guest("late", "Tardío"), "socket-late", room.code);
    assertEquals(MemberRole.SPECTATOR, room.members.get("late").role);
    assertEquals(List.of("host", "guest"), kit.manager.view(room, "late").revealSkip().playerIds());
    assertEquals("Solo los jugadores de la partida pueden pasar al siguiente.",
        rejection(() -> next(kit, room, "late")));
    next(kit, room, "host");
    next(kit, room, "guest");
    assertEquals(2_000, room.clockOffsetMs);
  }

  @Test
  @DisplayName("a player who disconnects stops counting: if the others are ready, the reveal is shortened")
  void disconnectionStopsCounting() {
    var kit = kit();
    var room = revealRoom(kit);
    next(kit, room, "host");
    kit.manager.disconnect("guest", "socket-guest");
    assertEquals(2_000, room.clockOffsetMs);
    assertEquals(List.of("host"), kit.manager.view(room, "host").revealSkip().playerIds());
    // La presencia sigue en hora real: la gracia de reconexión no se acorta con el reloj de la sala.
    join(kit.manager, guest("guest", "Ana"), "socket-guest-2", room.code);
    assertEquals(MemberRole.PLAYER, room.members.get("guest").role);
  }

  @Test
  @DisplayName("a late next (another reveal or no reveal) does nothing, and bad requests are rejected")
  void lateAndInvalidRequests() {
    var kit = kit();
    var room = revealRoom(kit);
    var oldEpoch = epoch(room);
    kit.passDeadline(room);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    assertNull(kit.manager.view(room, "host").revealSkip());
    next(kit, room, "host", oldEpoch);
    next(kit, room, "guest", oldEpoch);
    next(kit, room, "host"); // en la ronda activa
    assertEquals(0, room.clockOffsetMs);
    assertTrue(room.game.revealNextIds.isEmpty() || !epoch(room).equals(room.game.revealNextEpoch));

    assertEquals("Petición de «Siguiente» no válida.", rejection(() -> kit.manager.setRevealNext("host", json("{}"))));
    assertEquals("Petición de «Siguiente» no válida.", rejection(() -> kit.manager.setRevealNext("host",
        json("{\"gameInstanceId\":\"" + room.game.resultId + "\",\"actionEpoch\":\"x\",\"extra\":1}"))));
    assertEquals("El minijuego ya ha cambiado.", rejection(() -> kit.manager.setRevealNext("host",
        json("{\"gameInstanceId\":\"00000000-0000-4000-8000-999999999999\",\"actionEpoch\":\"x\"}"))));
  }

  @Test
  @DisplayName("ready players of one reveal do not carry over to the next one")
  void readySetIsPerReveal() {
    var kit = kit();
    var room = revealRoom(kit);
    next(kit, room, "host");
    kit.passDeadline(room);
    kit.time.advance(1_000);
    kit.manager.action("host", answer("HIGHER"));
    kit.manager.action("guest", answer("HIGHER"));
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    assertEquals(List.of(), kit.manager.view(room, "host").revealSkip().readyPlayerIds());
    next(kit, room, "guest");
    assertEquals(0, room.clockOffsetMs);
    assertEquals(List.of("guest"), kit.manager.view(room, "host").revealSkip().readyPlayerIds());
  }

  @Test
  @DisplayName("results and their auto-continue deadline follow the room clock")
  void resultsFollowTheRoomClock() {
    var kit = kit();
    var room = revealRoom(kit);
    next(kit, room, "host");
    next(kit, room, "guest");
    long offset = room.clockOffsetMs;
    assertNotNull(room.game);
    for (int step = 0; step < 20 && room.phase != RoomPhase.GAME_RESULTS; step++) kit.passDeadline(room);
    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
    var view = kit.manager.view(room, "host");
    assertEquals(kit.time.now() + offset, view.serverNow());
    assertNull(view.revealSkip());
    if (view.resultsEndsAt() != null) {
      assertTrue(view.resultsEndsAt() > view.serverNow());
      assertTrue(view.resultsEndsAt() - view.serverNow() <= RoomSettings.DEFAULTS.resultsAutoContinueMs());
    }
    // La auditoría guarda la hora real del arranque, no la de la sala.
    assertEquals(1, kit.audit.started.size());
    assertTrue(kit.audit.started.getFirst().startedAt() <= kit.time.now());
  }
}

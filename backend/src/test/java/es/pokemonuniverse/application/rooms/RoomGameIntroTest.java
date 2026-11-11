package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.guest;
import static es.pokemonuniverse.application.rooms.RoomTestKit.join;
import static es.pokemonuniverse.application.rooms.RoomTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.MemberRole;
import es.pokemonuniverse.domain.room.PresenceStatus;
import es.pokemonuniverse.domain.room.RoomPhase;
import java.util.LinkedHashMap;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Intro de partida (E1): fase de sala antes de {@code start}, de 8 s o hasta que todos los jugadores están listos. */
class RoomGameIntroTest {

  private static final long INTRO_MS = RoomSettings.DEFAULT_GAME_INTRO_MS;

  private static RoomTestKit kit() {
    return new RoomTestKit(RoomSettings.DEFAULTS, "shiny-vote");
  }

  /** Sala de dos con Higher or Lower lanzado: la sala queda en la intro. */
  private static LiveRoom introRoom(RoomTestKit kit) {
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.selectHigherLower("host");
    kit.startReady(room, "host");
    assertEquals(RoomPhase.GAME_INTRO, room.phase);
    return room;
  }

  private static void ready(RoomTestKit kit, LiveRoom room, String playerId) {
    kit.manager.setIntroReady(playerId, json("{\"gameInstanceId\":\"" + room.game.resultId + "\"}"));
  }

  private static String rejection(Runnable operation) {
    return assertThrows(RoomException.class, operation::run).getMessage();
  }

  @Test
  @DisplayName("the intro lasts 8 s, hides the unstarted game and then the first round starts its own clock")
  void introEndsAfterEightSeconds() {
    var kit = kit();
    var room = introRoom(kit);
    long launchedAt = kit.time.now();
    var view = kit.manager.view(room, "guest");
    assertEquals(RoomPhase.GAME_INTRO, view.phase());
    assertEquals(new RoomView.IntroView(launchedAt + INTRO_MS, List.of("host", "guest"), List.of()), view.intro());
    assertNull(view.game());
    assertNull(view.gamePlayerState());
    assertNull(view.gameActionEpoch());
    // Saltar sigue disponible: el estado de salto lleva el id de la partida.
    assertEquals(room.game.resultId, view.gameSkipState().gameInstanceId());
    assertEquals(RoomCoordinator.INTRO_NOT_OVER, rejection(() -> kit.manager.action("host", RoomTestKit.answer("HIGHER"))));
    // La auditoría del arranque no cambia: se registra al lanzar, con la hora del lanzamiento.
    assertEquals(1, kit.audit.started.size());

    kit.time.advance(INTRO_MS - 1);
    assertEquals(RoomPhase.GAME_INTRO, room.phase);
    kit.time.advance(1 + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    var started = kit.manager.view(room, "guest");
    assertNull(started.intro());
    assertNotNull(started.game());
    // La ronda 1 dura sus 10 s desde el final de la intro, no desde el lanzamiento.
    assertEquals(Long.valueOf(kit.time.now() + 10_000),
        room.game.engine.getLifecycle(room.game.state).nextDeadline());
    assertEquals(1, kit.audit.started.size());
  }

  @Test
  @DisplayName("the intro ends as soon as every connected player is ready")
  void introEndsWhenEveryoneIsReady() {
    var kit = kit();
    var room = introRoom(kit);
    kit.time.advance(2_000);
    ready(kit, room, "host");
    assertEquals(RoomPhase.GAME_INTRO, room.phase);
    assertEquals(List.of("host"), kit.manager.view(room, "guest").intro().readyPlayerIds());
    ready(kit, room, "host"); // repetir no cambia nada
    ready(kit, room, "guest");
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    assertEquals(Long.valueOf(kit.time.now() + 10_000),
        room.game.engine.getLifecycle(room.game.state).nextDeadline());
    // El plazo viejo de la intro ya no hace nada; un «¡Listo!» tardío de la misma partida tampoco.
    var game = room.game;
    var epoch = game.engine.getLifecycle(game.state).actionEpoch();
    kit.time.advance(INTRO_MS);
    ready(kit, room, "guest");
    assertSame(game, room.game);
    assertEquals(epoch, game.engine.getLifecycle(game.state).actionEpoch());
  }

  @Test
  @DisplayName("spectators see the intro but neither count nor can mark themselves ready")
  void spectatorsDoNotCount() {
    var kit = kit();
    var room = introRoom(kit);
    join(kit.manager, guest("late", "Tardío"), "socket-late", room.code);
    assertEquals(MemberRole.SPECTATOR, room.members.get("late").role);
    var view = kit.manager.view(room, "late");
    assertEquals(RoomPhase.GAME_INTRO, view.phase());
    assertEquals(List.of("host", "guest"), view.intro().playerIds());
    assertEquals("Solo los jugadores de la partida pueden marcarse como listos.", rejection(() -> ready(kit, room, "late")));
    ready(kit, room, "host");
    ready(kit, room, "guest");
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
  }

  @Test
  @DisplayName("ready requests are checked against the current game")
  void readyRequestsAreValidated() {
    var kit = kit();
    var room = introRoom(kit);
    assertEquals("Petición de «¡Listo!» no válida.", rejection(() -> kit.manager.setIntroReady("host", json("{}"))));
    assertEquals("Petición de «¡Listo!» no válida.", rejection(() -> kit.manager.setIntroReady("host",
        json("{\"gameInstanceId\":\"" + room.game.resultId + "\",\"extra\":1}"))));
    assertEquals("El minijuego ya ha cambiado.", rejection(() -> kit.manager.setIntroReady("host",
        json("{\"gameInstanceId\":\"00000000-0000-4000-8000-999999999999\"}"))));
    // Expulsar sigue siendo cosa del lobby, también durante la intro.
    assertEquals("This setting can only be changed in the lobby", rejection(() -> kit.manager.kick("host", "guest")));
  }

  @Test
  @DisplayName("a player who disconnects during the intro stops counting, and counts again after reconnecting")
  void disconnectAndReconnectDuringTheIntro() {
    var kit = kit();
    var room = introRoom(kit);
    ready(kit, room, "guest");
    kit.manager.disconnect("guest", "socket-guest");
    assertEquals(PresenceStatus.TEMPORARILY_DISCONNECTED, room.members.get("guest").presence);
    assertEquals(RoomPhase.GAME_INTRO, room.phase);
    assertEquals(List.of("host"), kit.manager.view(room, "host").intro().playerIds());
    assertEquals(List.of(), kit.manager.view(room, "host").intro().readyPlayerIds());

    join(kit.manager, guest("guest", "Ana"), "socket-guest-2", room.code);
    assertEquals(RoomPhase.GAME_INTRO, room.phase);
    assertEquals(List.of("host", "guest"), kit.manager.view(room, "guest").intro().playerIds());
    ready(kit, room, "host");
    assertEquals(RoomPhase.GAME_INTRO, room.phase); // quien vuelve tiene que pulsar otra vez
    ready(kit, room, "guest");
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
  }

  @Test
  @DisplayName("the engine learns at the end of the intro who disconnected during it")
  void presenceReachesTheEngineAtTheEndOfTheIntro() {
    var kit = kit();
    var room = introRoom(kit);
    kit.manager.disconnect("guest", "socket-guest");
    ready(kit, room, "host"); // el único jugador conectado
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    var guestPlayer = kit.manager.context(room).players().stream().filter(p -> p.id().equals("guest")).findFirst()
        .orElseThrow();
    // Dentro de la gracia de presencia (8 s) el motor aún lo ve conectado; vencida, deja de verlo.
    assertTrue(guestPlayer.connected());
    kit.time.advance(8_000 + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
  }

  @Test
  @DisplayName("the intro also ends on its deadline when nobody is connected")
  void introWithNobodyConnected() {
    var kit = kit();
    var room = introRoom(kit);
    kit.manager.disconnect("host", "socket-host");
    kit.manager.disconnect("guest", "socket-guest");
    assertEquals(RoomPhase.GAME_INTRO, room.phase);
    kit.time.advance(INTRO_MS + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    // El motor empieza y sabe a la vez que nadie sigue conectado (Higher or Lower cierra la ronda).
    assertTrue(room.phase != RoomPhase.GAME_INTRO);
    assertNotNull(kit.manager.view(room, "host").gameActionEpoch());
  }

  @Test
  @DisplayName("a unanimous skip during the intro skips the game")
  void skipDuringTheIntro() {
    var kit = kit();
    var room = introRoom(kit);
    var skipped = room.game;
    for (var id : List.of("host", "guest")) {
      kit.manager.setGameSkipVote(id, json("{\"gameInstanceId\":\"" + skipped.resultId + "\",\"wantsToSkip\":true}"));
    }
    assertNotSame(skipped, room.game);
    assertEquals(1, kit.audit.abandoned.size());
    // El plazo de la intro saltada no arranca nada: la sala sigue donde la dejó el salto.
    var phase = room.phase;
    var game = room.game;
    kit.time.advance(INTRO_MS + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    if (game == null) assertEquals(phase, room.phase);
  }

  @Test
  @DisplayName("when the host leaves during the intro the host passes on and the intro goes on")
  void hostLeavesDuringTheIntro() {
    var kit = kit();
    var room = introRoom(kit);
    kit.manager.leave("host");
    assertEquals("guest", room.hostId);
    assertEquals(RoomPhase.GAME_INTRO, room.phase);
    assertEquals(List.of("guest"), kit.manager.view(room, "guest").intro().playerIds());
    ready(kit, room, "guest");
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
  }

  @Test
  @DisplayName("a start that fails at the end of the intro skips the game instead of leaving the room stuck")
  void failingStartSkipsTheGame() {
    var engines = new LinkedHashMap<String, GameEngine<?, ?, ?, ?>>();
    engines.put("higher-lower", RoomTestKit.REAL_REGISTRY.engine("higher-lower").orElseThrow());
    engines.put("shiny-vote", new FakeEngine(RoomTestKit.REAL_REGISTRY.get("shiny-vote").orElseThrow(), true));
    GameRegistry registry = RoomTestKit.REAL_REGISTRY.withEngines(engines);
    var kit = new RoomTestKit(50_000, UserGameConfigPreferences.NO_OP, HostContentProvider.EMPTY, registry,
        RoomSettings.DEFAULTS);
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.manager.selectGame("host", "shiny-vote");
    kit.manager.updateSession("host", json("{\"type\":\"GAME_COUNT\",\"target\":1}"));
    kit.startReady(room, "host");
    assertEquals(RoomPhase.GAME_INTRO, room.phase);
    kit.time.advance(INTRO_MS + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    assertTrue(room.phase != RoomPhase.GAME_INTRO, "la sala no se queda en la intro");
    assertEquals(1, kit.audit.abandoned.size());
  }

  /**
   * El azar no cambia de orden: con la misma semilla, la partida empezada tras la intro (con una reconexión y varias
   * difusiones en medio) es idéntica a la empezada al lanzarla, y la fuente queda en el mismo punto. Unown y ¿Quién soy?
   * extraen azar en {@code start}.
   */
  @Test
  void randomOrderDoesNotChange() {
    for (var gameId : List.of("unown-translator", "who-am-i", "higher-lower")) assertSameStart(gameId);
  }

  private static void assertSameStart(String gameId) {
    var direct = realKit(RoomTestKit.NO_INTRO);
    var withIntro = realKit(RoomSettings.DEFAULTS);
    var directRoom = launch(direct, gameId);
    var introRoom = launch(withIntro, gameId);
    assertEquals(RoomPhase.GAME_INTRO, introRoom.phase);
    withIntro.manager.disconnect("guest", "socket-guest");
    join(withIntro.manager, guest("guest", "Ana"), "socket-guest-2", introRoom.code);
    withIntro.manager.view(introRoom, "host");
    ready(withIntro, introRoom, "host");
    ready(withIntro, introRoom, "guest");
    assertTrue(introRoom.phase != RoomPhase.GAME_INTRO);
    assertEquals(directRoom.phase, introRoom.phase, gameId);
    assertEquals(directRoom.game.state, introRoom.game.state, gameId);
    assertEquals(direct.random.next(), withIntro.random.next(), gameId);
  }

  private static RoomTestKit realKit(RoomSettings settings) {
    return new RoomTestKit(50_000, UserGameConfigPreferences.NO_OP, HostContentProvider.EMPTY,
        RoomTestKit.REAL_REGISTRY, settings);
  }

  private static LiveRoom launch(RoomTestKit kit, String gameId) {
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.manager.selectGame("host", gameId);
    kit.startReady(room, "host");
    return room;
  }
}

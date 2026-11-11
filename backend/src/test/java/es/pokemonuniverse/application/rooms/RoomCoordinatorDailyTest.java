package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.CATALOG;
import static es.pokemonuniverse.application.rooms.RoomTestKit.MAPPER;
import static es.pokemonuniverse.application.rooms.RoomTestKit.json;
import static es.pokemonuniverse.application.rooms.RoomTestKit.user;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.daily.DailyGames;
import es.pokemonuniverse.application.time.RandomSource;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.room.DailyRoom;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.PresenceStatus;
import es.pokemonuniverse.domain.room.RoomPhase;
import es.pokemonuniverse.domain.room.SessionMode;
import io.micronaut.json.tree.JsonNode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.DoubleSupplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;

/** Salas del reto diario en el coordinador: un jugador, sin lobby, sin auditoría, persistencia ni XP. */
class RoomCoordinatorDailyTest {

  private static final LocalDate DATE = LocalDate.of(2026, 11, 7);
  private static final AuthUser ASH = user("ash", "Ash", "ash@mail.com");
  private static final AuthUser MISTY = user("misty", "Misty", "misty@mail.com");
  private static final int XP = 500;

  /** Cuenta las llamadas a {@code next()}; {@code nextInt} (código de sala) y los UUID no pasan por él. */
  static final class CountingRandom implements RandomSource {
    private final SeededRandom delegate = new SeededRandom(42);
    int nextCalls;

    @Override
    public double next() {
      nextCalls++;
      return delegate.next();
    }

    @Override
    public String uuid() {
      return delegate.uuid();
    }

    @Override
    public int nextInt(int bound) {
      return delegate.nextInt(bound);
    }
  }

  /** Oyente con la lógica real de {@link DailyGames}: observa cada estado y calcula el resultado al terminar. */
  static final class RecordingDailyRuns implements DailyRunListener {
    final List<Object> observed = new CopyOnWriteArrayList<>();
    final List<GameResults> finished = new CopyOnWriteArrayList<>();
    final List<DailyRoom> abandoned = new CopyOnWriteArrayList<>();

    @Override
    public void observe(DailyRoom daily, Object publicState) {
      observed.add(publicState);
      DailyGames.byId(daily.gameId).orElseThrow().observe(publicState, daily.userId, daily.outcomes);
    }

    @Override
    public CompletableFuture<Void> finished(DailyRoom daily, GameResults results) {
      finished.add(results);
      daily.outcome = DailyGames.outcome(DailyGames.byId(daily.gameId).orElseThrow(), daily.outcomes, results,
          daily.userId);
      return CompletableFuture.completedFuture(null);
    }

    @Override
    public CompletableFuture<Void> abandoned(DailyRoom daily) {
      abandoned.add(daily);
      return CompletableFuture.completedFuture(null);
    }
  }

  /** Azar de la partida que cuenta lo que consume el motor. */
  static final class CountingSupplier implements DoubleSupplier {
    private final Mulberry32 prng = new Mulberry32(2026);
    int calls;

    @Override
    public double getAsDouble() {
      calls++;
      return prng.getAsDouble();
    }
  }

  final ManualTime time = new ManualTime(50_000);
  final CountingRandom random = new CountingRandom();
  final RecordingEvents events = new RecordingEvents();
  final RecordingAudit audit = new RecordingAudit();
  final RecordingPersister persister = new RecordingPersister();
  final RecordingDailyRuns runs = new RecordingDailyRuns();
  final GameRegistry registry = RoomTestKit.registry();
  RoomCoordinator manager = build(RoomSettings.DEFAULTS);

  private RoomCoordinator build(RoomSettings settings) {
    return RoomTestKit.coordinator(registry, events, audit, persister, UserGameConfigPreferences.NO_OP,
        HostContentProvider.EMPTY, time, random, time, settings,
        RoomTestKit.Hooks.NONE.withDailyRuns(runs).withExperience(userId -> XP));
  }

  private DailyLaunch launch(String gameId, DoubleSupplier gameRandom) {
    var game = DailyGames.byId(gameId).orElseThrow();
    var defaults = RoomTestKit.tree(registry.get(gameId).orElseThrow().defaultConfig());
    return new DailyLaunch(new DailyRoom("row-1", ASH.id(), DATE, gameId, game.roundCount()), game.config(defaults),
        CATALOG, gameRandom);
  }

  private LiveRoom start(String gameId) {
    return start(gameId, new CountingSupplier());
  }

  private LiveRoom start(String gameId, DoubleSupplier gameRandom) {
    var view = manager.startDaily(ASH, "socket-ash", launch(gameId, gameRandom));
    return manager.store.get(view.code());
  }

  private void passDeadline(LiveRoom room) {
    var deadline = room.game.engine.getLifecycle(room.game.state).nextDeadline();
    assertNotNull(deadline, "sin plazo en " + room.phase);
    time.advance(Math.max(0, deadline - time.now()) + RoomCoordinator.DEADLINE_TOLERANCE_MS);
  }

  /** Deja vencer cada plazo hasta los resultados. */
  private void finishByTimeouts(LiveRoom room) {
    for (int step = 0; step < 100 && room.phase != RoomPhase.GAME_RESULTS; step++) passDeadline(room);
    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
  }

  /** Juega cada ronda activa con {@code action} una vez y deja vencer los demás plazos. */
  private void playEveryRound(LiveRoom room, JsonNode action) {
    String actedEpoch = null;
    for (int step = 0; step < 200 && room.phase != RoomPhase.GAME_RESULTS; step++) {
      var epoch = room.game.engine.getLifecycle(room.game.state).actionEpoch();
      if (room.phase == RoomPhase.ROUND_ACTIVE && !epoch.equals(actedEpoch)) {
        actedEpoch = epoch;
        time.advance(1_000);
        manager.action(ASH.id(), action);
      } else {
        passDeadline(room);
      }
    }
    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
  }

  private static void assertRejects(String message, Executable operation) {
    assertEquals(message, assertThrows(RoomException.class, operation).getMessage());
  }

  private RoomView lastState() {
    return events.lastStateFor(ASH.id());
  }

  @Test
  void startsSoloGameWithoutLobby() {
    var view = manager.startDaily(ASH, "socket-ash", launch("pokedex-distance", new CountingSupplier()));
    var room = manager.store.get(view.code());
    assertEquals(RoomPhase.of(room.game.engine.getLifecycle(room.game.state).phase()), view.phase());
    assertEquals(RoomPhase.ROUND_ACTIVE, view.phase());
    assertEquals(1, view.maxPlayers());
    assertEquals(new SessionMode.GameCount(1), view.sessionMode());
    assertEquals("POINTS", room.game.configTree.get("mode").getStringValue());
    assertEquals(List.of(ASH.id()), room.game.participantIds);
    assertEquals(new RoomView.DailyView("pokedex-distance", "2026-11-07", 5, null), view.daily());
    // El id de la partida viaja en el estado de salto: sin él, la web no puede enviar `game:action`.
    assertEquals(room.game.resultId, view.gameSkipState().gameInstanceId());
    assertEquals(Map.of(), view.allowedModes());
    assertEquals(List.of(), view.customizedGameIds());
    assertEquals(List.of("pokedex-distance"), List.copyOf(view.gameConfigs().keySet()));
    assertTrue(audit.created.isEmpty());
    assertTrue(audit.started.isEmpty());
  }

  @Test
  void contextUsesTheRunRandom() {
    var gameRandom = new CountingSupplier();
    var room = start("pokedex-distance", gameRandom);
    int afterStart = gameRandom.calls;
    assertTrue(afterStart > 0, "el motor no usó el azar de la partida");
    // Las rondas siguientes, sorteadas en contextos posteriores (temporizadores), siguen usando el mismo azar.
    passDeadline(room);
    passDeadline(room);
    assertTrue(gameRandom.calls > afterStart, "la segunda ronda no usó el azar de la partida");
    assertEquals(0, random.nextCalls, "el azar global se usó para el contenido");
    assertEquals(CATALOG, manager.currentPokemonCatalog());
  }

  @Test
  void everyLobbyCommandIsRejectedInDailyRoom() {
    var room = start("higher-lower");
    assertAllRejected(room);
    finishByTimeouts(room);
    // En los resultados es donde continuar, volver al lobby o terminar la sesión sacarían la sala del reto.
    assertAllRejected(room);
    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
    assertEquals(1, room.members.size());
  }

  private void assertAllRejected(LiveRoom room) {
    var id = ASH.id();
    var skip = json("{\"gameInstanceId\":\"" + room.game.resultId + "\",\"wantsToSkip\":true}");
    Map<String, Executable> commands = Map.ofEntries(
        Map.entry("room:select-game", () -> manager.selectGame(id, "higher-lower")),
        Map.entry("room:update-config", () -> manager.updateConfig(id, json("{}"))),
        Map.entry("room:update-game-config", () -> manager.updateGameConfig(id, "higher-lower", json("{}"))),
        Map.entry("room:update-session", () -> manager.updateSession(id, json("{\"type\":\"INFINITE\"}"))),
        Map.entry("room:update-game-selection", () -> manager.updateGameSelection(id,
            json("{\"type\":\"ORDER\",\"gameIds\":[\"higher-lower\"]}"))),
        Map.entry("room:update-allowed-modes", () -> manager.updateAllowedModes(id, "higher-lower",
            json("[\"CLASSIC\"]"))),
        Map.entry("room:vote-next-game", () -> manager.voteNextGame(id, "higher-lower")),
        Map.entry("room:set-role", () -> manager.setRoomRole(id, "misty", JsonNode.createStringNode("CO_HOST"))),
        Map.entry("room:transfer-host", () -> manager.transferHost(id, "misty")),
        Map.entry("room:kick", () -> manager.kick(id, "misty")),
        Map.entry("room:chat:send", () -> manager.sendChat(id, JsonNode.createStringNode("hola"))),
        Map.entry("room:chat:delete", () -> manager.deleteChatMessage(id, JsonNode.createNumberNode(1))),
        Map.entry("room:chat:mute", () -> manager.setChatMute(id, "misty", JsonNode.createBooleanNode(true))),
        Map.entry("room:set-ready", () -> RoomTestKit.setReady(manager, id, true)),
        Map.entry("room:start-game", () -> manager.startGame(id)),
        Map.entry("room:continue-session", () -> manager.continueSession(id)),
        Map.entry("room:return-lobby", () -> manager.returnLobby(id)),
        Map.entry("room:end-session", () -> manager.endSession(id)),
        Map.entry("game:skip-vote:set", () -> manager.setGameSkipVote(id, skip)));
    assertEquals(19, commands.size()); // room:invite va aparte: RoomInvitationsTest#rejectsFromTheDailyChallengeRoom
    var phase = room.phase;
    for (var command : commands.entrySet()) {
      var error = assertThrows(RoomException.class, command.getValue(), command.getKey());
      assertEquals(RoomCoordinator.DAILY_UNAVAILABLE, error.getMessage(), command.getKey());
    }
    assertEquals(phase, room.phase);
    assertTrue(room.game.skipVoterIds.isEmpty());
  }

  @Test
  void othersCannotJoinOrInviteIntoDailyRoom() {
    var room = start("higher-lower");
    assertRejects("Room not found", () -> RoomTestKit.join(manager, MISTY, "socket-misty", room.code));
    assertNull(manager.store.roomForPlayer(MISTY.id()));
    assertEquals(1, room.members.size());
    // roomOf no da la sala (nadie invita a ella); dailyRunOf sí, y es lo que rechaza room:invite desde ella.
    assertTrue(manager.roomOf(ASH.id()).isEmpty());
    assertTrue(manager.dailyRunOf(ASH.id()).isPresent());

    manager.disconnect(ASH.id(), "socket-ash");
    var rejoined = RoomTestKit.join(manager, ASH, "socket-ash-2", room.code);
    assertEquals(room.code, rejoined.code());
    assertEquals(PresenceStatus.CONNECTED, room.members.get(ASH.id()).presence);

    manager.disconnect(ASH.id(), "socket-ash-2");
    assertTrue(manager.attach(ASH, "socket-ash-3"));
    assertTrue(events.named("session:restored").stream().anyMatch(sent -> sent.connectionId().equals("socket-ash-3")));
    assertEquals("socket-ash-3", room.members.get(ASH.id()).connectionId);
    assertTrue(runs.abandoned.isEmpty());
  }

  @Test
  void observeIsCalledOnEveryBroadcast() {
    var room = start("higher-lower");
    manager.action(ASH.id(), RoomTestKit.answer("HIGHER"));
    passDeadline(room);
    manager.updateIdentityAvatar(ASH.id(), new AvatarRef.Custom("pikachu", 1));
    manager.disconnect(ASH.id(), "socket-ash");
    RoomTestKit.join(manager, ASH, "socket-ash-2", room.code);
    assertNull(room.game.finishReason);
    // Cada difusión sube la revisión una vez, también las que no llegan a nadie (jugador desconectado).
    assertTrue(room.revision >= 5);
    assertEquals(room.revision, runs.observed.size());
    // Y al terminar se observa el estado final una vez más, antes de fijar el resultado.
    finishByTimeouts(room);
    assertEquals(room.revision, runs.observed.size());
  }

  @Test
  void gameActionWithTheProjectedIdsReachesTheEngine() {
    // Como la web (`gameActionPayload`): el id de la partida sale de `gameSkipState` y la época de `gameActionEpoch`.
    var room = start("higher-lower");
    var view = lastState();
    assertEquals(RoomPhase.ROUND_ACTIVE, view.phase());
    var skip = view.gameSkipState();
    assertNotNull(skip, "sin estado de salto la web no tiene id de partida");
    assertFalse(skip.canVote(), "en el reto no se vota saltar");
    var epoch = view.gameActionEpoch();
    assertNotNull(epoch);
    time.advance(1_000);
    manager.gameAction(ASH.id(), envelope(skip.gameInstanceId(), epoch));
    assertNotEquals(epoch, room.game.engine.getLifecycle(room.game.state).actionEpoch(), "la respuesta cerró la ronda");
    assertRejects("El minijuego ya ha cambiado.", () -> manager.gameAction(ASH.id(),
        envelope("00000000-0000-4000-8000-000000000000", epoch)));
  }

  /** Sobre de {@code game:action} con la respuesta «HIGHER». */
  private static JsonNode envelope(String gameInstanceId, String epoch) {
    try {
      return MAPPER.writeValueToTree(Map.of("gameInstanceId", gameInstanceId, "actionEpoch", epoch,
          "action", Map.of("type", "ANSWER", "choice", "HIGHER")));
    } catch (java.io.IOException e) {
      throw new java.io.UncheckedIOException(e);
    }
  }

  @Test
  void dailyFinishSkipsPersisterAuditAndXp() {
    var room = start("higher-lower");
    playEveryRound(room, RoomTestKit.answer("HIGHER"));
    manager.flush();
    assertEquals(1, runs.finished.size());
    assertTrue(persister.calls.isEmpty());
    assertTrue(audit.created.isEmpty() && audit.started.isEmpty() && audit.closed.isEmpty()
        && audit.abandoned.isEmpty());
    var member = room.members.get(ASH.id());
    assertEquals(XP, member.xp);
    assertEquals(0, member.sessionPoints);
    var result = lastState().daily().result();
    assertNotNull(result);
    assertEquals(room.daily.outcome.score(), result.score());
    assertEquals(10, result.rounds().size());

    manager.leave(ASH.id());
    manager.flush();
    assertTrue(audit.closed.isEmpty());
    assertTrue(persister.calls.isEmpty());
  }

  @Test
  void leavingMidRunCallsAbandoned() {
    var room = start("higher-lower");
    manager.leave(ASH.id());
    manager.flush();
    assertEquals(1, runs.abandoned.size());
    assertTrue(runs.finished.isEmpty());
    assertNull(manager.store.get(room.code));
    assertNull(manager.store.roomForPlayer(ASH.id()));
    assertTrue(manager.dailyRunOf(ASH.id()).isEmpty());
    assertTrue(audit.closed.isEmpty() && audit.abandoned.isEmpty());
  }

  @Test
  void leavingAfterResultsDoesNot() {
    var room = start("higher-lower");
    finishByTimeouts(room);
    manager.leave(ASH.id());
    manager.flush();
    assertTrue(runs.abandoned.isEmpty());
    assertEquals(1, runs.finished.size());
    assertNull(manager.store.get(room.code));
    assertNull(manager.store.roomForPlayer(ASH.id()));
  }

  @Test
  void reconnectGraceExpiryMidRunCallsAbandoned() {
    // Gracia de reconexión corta: vence antes que cualquier plazo de la ronda.
    manager = build(new RoomSettings(8, 1_000));
    var room = start("higher-lower");
    manager.disconnect(ASH.id(), "socket-ash");
    time.advance(1_000 + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    manager.flush();
    assertTrue(runs.finished.isEmpty(), "la partida terminó antes de vencer la gracia");
    assertEquals(1, runs.abandoned.size());
    assertNull(manager.store.get(room.code));
    assertNull(manager.store.roomForPlayer(ASH.id()));
  }

  @Test
  void startDailyWhileInRoomIsRejected() {
    manager.create(ASH, "socket-ash", null);
    assertRejects("Leave your current room first",
        () -> manager.startDaily(ASH, "socket-ash", launch("higher-lower", new CountingSupplier())));
    manager.leave(ASH.id());

    start("higher-lower");
    assertRejects("Leave your current room first",
        () -> manager.startDaily(ASH, "socket-ash", launch("higher-lower", new CountingSupplier())));
    assertEquals(1, manager.store.list().size());
  }

  @Test
  void failedStartLeavesNoRoom() {
    var good = launch("higher-lower", new CountingSupplier());
    var broken = new DailyLaunch(new DailyRoom("row-1", ASH.id(), DATE, "no-such-game", 3), good.config(),
        good.pokemon(), good.random());
    assertThrows(RoomException.class, () -> manager.startDaily(ASH, "socket-ash", broken));
    assertNull(manager.store.roomForPlayer(ASH.id()));
    assertTrue(manager.store.list().isEmpty());
    assertTrue(runs.abandoned.isEmpty());
    // Sin sala colgada, se puede reintentar.
    assertNotNull(start("higher-lower"));
  }

  @Test
  void dailyRunOfReportsLiveRun() {
    assertTrue(manager.dailyRunOf(ASH.id()).isEmpty());
    var room = start("higher-lower");
    assertEquals(new DailyRunRef(DATE, "higher-lower", false), manager.dailyRunOf(ASH.id()).orElseThrow());
    finishByTimeouts(room);
    assertEquals(new DailyRunRef(DATE, "higher-lower", true), manager.dailyRunOf(ASH.id()).orElseThrow());
    manager.create(MISTY, "socket-misty", null);
    assertTrue(manager.dailyRunOf(MISTY.id()).isEmpty());
  }

  @Test
  void outcomeIncludesLastRoundAndDistanceHistory() {
    var distance = start("pokedex-distance");
    playEveryRound(distance, json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"bulbasaur\"}"));
    var distanceRounds = distance.daily.outcome.rounds();
    assertEquals(5, distanceRounds.size());
    assertTrue(distanceRounds.stream().allMatch(value -> value >= 0), distanceRounds.toString());
    assertEquals(distanceRounds, lastState().daily().result().rounds());
    manager.leave(ASH.id());

    var higherLower = start("higher-lower");
    playEveryRound(higherLower, RoomTestKit.answer("HIGHER"));
    var rounds = new ArrayList<>(higherLower.daily.outcome.rounds());
    assertEquals(10, rounds.size());
    assertTrue(rounds.stream().allMatch(value -> value == 0 || value == 1), rounds.toString());
    assertNotEquals(-1, rounds.getLast());
  }

  @Test
  void staysInGameResultsUntilLeave() {
    var room = start("higher-lower");
    finishByTimeouts(room);
    time.advance(10 * 60_000);
    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
    assertNotNull(room.game);
    assertEquals(room, manager.store.get(room.code));
    assertFalse(manager.dailyRunOf(ASH.id()).isEmpty());
  }
}

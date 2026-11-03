package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.activeSkipFixture;
import static es.pokemonuniverse.application.rooms.RoomTestKit.answer;
import static es.pokemonuniverse.application.rooms.RoomTestKit.guest;
import static es.pokemonuniverse.application.rooms.RoomTestKit.json;
import static es.pokemonuniverse.application.rooms.RoomTestKit.serialize;
import static es.pokemonuniverse.application.rooms.RoomTestKit.user;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonAudioCatalog;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.room.GameFinishReason;
import es.pokemonuniverse.domain.room.GameSelectionMode;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.MemberRole;
import es.pokemonuniverse.domain.room.PresenceStatus;
import es.pokemonuniverse.domain.room.RoomPhase;
import es.pokemonuniverse.domain.room.RoomRole;
import es.pokemonuniverse.domain.room.SessionGameSummary;
import es.pokemonuniverse.domain.room.SessionMode;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Escenarios de {@code apps/server/src/rooms/manager.test.ts} sobre el coordinador Java con los motores portados.
 * Donde el TS mutaba el estado del motor ({@code nextTransitionAt = 0; tick(room)}) aquí se avanza el reloj manual
 * hasta el plazo y dispara el temporizador real de la sala. Los juegos sin motor que el TS usa para rotaciones de tres
 * juegos se sustituyen por {@link FakeEngine} bajo su manifiesto real.
 */
class RoomCoordinatorTest {

  private static RoomException rejects(Runnable operation) {
    return assertThrows(RoomException.class, operation::run);
  }

  private static void assertMessage(String expected, Runnable operation) {
    assertEquals(expected, rejects(operation).getMessage());
  }

  // ------------------------------------------------------------------------------------- entrar, salir, presencia

  @Test
  @DisplayName("creates, joins and rejects full rooms, double membership and unknown codes")
  void createJoinAndMembershipRules() {
    var kit = new RoomTestKit();
    var host = guest("host", "Host");
    var created = kit.manager.create(host, "socket-host", JsonNode.createNumberNode(2));
    assertEquals(6, created.code().length());
    assertTrue(created.code().chars().allMatch(c -> "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".indexOf(c) >= 0));
    assertEquals(2, created.maxPlayers());
    assertEquals(0, created.revision());
    assertEquals(RoomPhase.LOBBY, created.phase());
    assertEquals("pokedex-distance", created.selectedGameId());
    assertMessage("Already in a room", () -> kit.manager.create(host, "socket-host-2", null));

    var guestView = kit.manager.join(guest("ana", "Ana"), "socket-ana", created.code().toLowerCase() + " ");
    assertEquals(List.of("host", "ana"), guestView.members().stream().map(RoomView.MemberView::id).toList());
    assertMessage("Room is full", () -> kit.manager.join(guest("carlos", "Carlos"), "socket-carlos", created.code()));

    var other = kit.manager.create(guest("solo", "Solo"), "socket-solo", null);
    assertEquals(8, other.maxPlayers());
    assertMessage("Leave your current room first", () -> kit.manager.join(guest("solo", "Solo"), "socket-solo",
        created.code()));
    assertMessage("Room not found", () -> kit.manager.join(guest("x", "X"), "socket-x", "ZZZZZZ"));
    assertTrue(rejects(() -> kit.manager.join(guest("x", "X"), "socket-x", "abc")).getMessage()
        .contains("Invalid string: must match pattern /^[A-Z2-9]{6}$/"));
    assertMessage("Room capacity must be an integer of at least 2",
        () -> kit.manager.create(guest("y", "Y"), "socket-y", JsonNode.createNumberNode(1)));
    assertMessage("Room capacity must be an integer of at least 2",
        () -> kit.manager.create(guest("y", "Y"), "socket-y", JsonNode.createNumberNode(2.5)));
    assertMessage("Room capacity must be an integer of at least 2",
        () -> kit.manager.create(guest("y", "Y"), "socket-y", JsonNode.createStringNode("8")));
    assertEquals(100, kit.manager.create(guest("big", "Big"), "socket-big", JsonNode.createNumberNode(500)).maxPlayers());
    assertMessage("Not in a room", () -> kit.manager.leave("nobody"));
  }

  @Test
  @DisplayName("audits room and game starts while exposing only an admin-safe live projection")
  void auditsAndAdminProjection() {
    var kit = new RoomTestKit();
    var host = new AuthUser("host-user", "Host", AuthUser.Kind.USER, "host@example.com",
        es.pokemonuniverse.domain.identity.UserRole.ADMIN, new AvatarRef.Default());
    var room = kit.room(8, host, guest("guest-user", "Guest"));

    assertEquals(1, kit.audit.created.size());
    var created = kit.audit.created.getFirst();
    assertEquals(room.historyId, created.id());
    assertEquals(room.code, created.code());
    assertEquals("host-user", created.hostUserId());
    kit.startReady(room, host.id());
    var started = kit.audit.started.getFirst();
    assertEquals(room.historyId, started.roomHistoryId());
    assertEquals(room.code, started.roomCode());
    assertEquals(2, started.playerCount());

    var snapshot = kit.manager.adminRooms().getFirst();
    assertEquals(room.code, snapshot.code());
    assertEquals(room.game.gameId, snapshot.gameId());
    assertEquals(2, snapshot.connectedPlayers());
    assertFalse(serialize(snapshot).contains("targetDexNumber"));
    assertFalse(serialize(snapshot).contains("host@example.com"));

    kit.manager.finalDisconnect(room, host.id(), true);
    kit.manager.finalDisconnect(room, "guest-user", true);
    var closed = kit.audit.closed.getFirst();
    assertEquals(room.historyId, closed.id());
    assertEquals(room.game.resultId, closed.gameResultId());
    assertEquals("EMPTY_AFTER_LEAVE", closed.reason());
    assertNull(kit.manager.store.get(room.code));
  }

  @Test
  @DisplayName("rejects mutations from a socket replaced by a newer connection")
  void rejectsReplacedConnection() {
    var kit = new RoomTestKit();
    var host = guest("host", "Host");
    kit.manager.create(host, "host-old", JsonNode.createNumberNode(8));
    var room = kit.manager.store.roomForPlayer(host.id());

    assertTrue(kit.manager.connect(host, "host-current"));
    assertEquals("host-current", room.members.get(host.id()).connectionId);
    assertEquals(1, kit.events.named("session:restored").size());

    assertMessage("Esta conexión ha sido reemplazada por una sesión más reciente.",
        () -> kit.manager.withConnection(host.id(), "host-old", () -> {
          kit.manager.leave(host.id());
          return null;
        }));
    assertSame(room, kit.manager.store.get(room.code));
    kit.manager.withConnection(host.id(), "host-current", () -> {
      kit.manager.leave(host.id());
      return null;
    });
    assertNull(kit.manager.store.get(room.code));
  }

  @Test
  @DisplayName("keeps identity during grace, restores it, and transfers host only after expiration")
  void graceRestoreAndHostTransfer() {
    var kit = new RoomTestKit(10_000, UserGameConfigPreferences.NO_OP);
    var host = guest("host", "Host");
    var guestUser = guest("guest", "Guest");
    var created = kit.manager.create(host, "host-1", JsonNode.createNumberNode(8));
    var room = kit.manager.store.get(created.code());
    kit.manager.join(guestUser, "guest-1", room.code);
    kit.manager.setReady(guestUser.id(), true);
    kit.manager.disconnect(host.id(), "host-1");
    assertEquals(host.id(), room.hostId);
    assertEquals(PresenceStatus.TEMPORARILY_DISCONNECTED, room.members.get(host.id()).presence);

    kit.manager.connect(host, "host-2");
    var restored = room.members.get(host.id());
    assertTrue(restored.connected);
    assertEquals(PresenceStatus.CONNECTED, restored.presence);
    assertEquals("host-2", restored.connectionId);
    assertTrue(room.members.get(guestUser.id()).ready);
    var restoredEvent = kit.events.named("session:restored").getLast();
    assertEquals("host-2", restoredEvent.connectionId());
    assertEquals(room.code, ((RoomView) restoredEvent.payload()).code());

    kit.manager.disconnect(host.id(), "host-2");
    kit.time.advance(29_999);
    assertEquals(host.id(), room.hostId);
    kit.time.advance(1);
    assertEquals(guestUser.id(), room.hostId);
    assertEquals(RoomRole.HOST, room.members.get(guestUser.id()).roomRole);
    assertFalse(room.members.get(guestUser.id()).ready);
    assertFalse(room.members.containsKey(host.id()));
    assertNull(kit.manager.store.roomForPlayer(host.id()));
  }

  @Test
  @DisplayName("keeps a new disconnect reservation after the old membership is kicked and replaced")
  void disconnectReservationSurvivesKick() {
    var kit = new RoomTestKit();
    var host = guest("timer-host", "Host");
    var guestUser = guest("timer-guest", "Guest");
    var room = kit.manager.store.get(kit.manager.create(host, "timer-host-socket", JsonNode.createNumberNode(8)).code());
    kit.manager.join(guestUser, "timer-old", room.code);
    kit.manager.disconnect(guestUser.id(), "timer-old");
    var previous = room.members.get(guestUser.id());
    kit.time.advance(10_000);
    kit.manager.kick(host.id(), guestUser.id());
    assertNull(previous.disconnectTimer);
    kit.manager.join(guestUser, "timer-new", room.code);
    kit.manager.disconnect(guestUser.id(), "timer-new");
    var replacement = room.members.get(guestUser.id());
    kit.time.advance(20_000);
    assertSame(replacement, room.members.get(guestUser.id()));
    assertSame(room, kit.manager.store.roomForPlayer(guestUser.id()));
    kit.time.advance(10_000);
    assertFalse(room.members.containsKey(guestUser.id()));
  }

  @Test
  @DisplayName("expires an active identity without losing historical game data or blocking the round")
  void expiresIdentityDuringPokedexDistance() {
    var kit = new RoomTestKit(20_000, UserGameConfigPreferences.NO_OP);
    var room = kit.room(8, guest("host", "Host"), guest("ana", "Ana"), guest("carlos", "Carlos"));
    kit.manager.updateConfig("host", json("{\"generations\":[1],\"roundSeconds\":60,\"selectionVisibility\":\"HIDDEN\"}"));
    kit.startReady(room, "host");
    kit.manager.disconnect("carlos", "socket-carlos");
    kit.time.advance(30_000);
    assertEquals(PresenceStatus.LEFT, room.members.get("carlos").presence);
    assertFalse(room.members.get("carlos").connected);
    assertNull(kit.manager.store.roomForPlayer("carlos"));
    kit.manager.action("host", json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"bulbasaur\"}"));
    kit.manager.action("ana", json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"ivysaur\"}"));
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    var lastRound = kit.publicGame(room, "host").get("lastRound");
    assertEquals("NO_RESPONSE", lastRound.get("reason").getStringValue());
    assertTrue(JsonTree.equal(json("[\"carlos\"]"), lastRound.get("eliminatedIds")));
    assertEquals(MemberRole.SPECTATOR, room.members.get("carlos").role);
    assertMessage("Not in a room",
        () -> kit.manager.action("carlos", json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"venusaur\"}")));
  }

  // ------------------------------------------------------------------------------ gracia de presencia por juego

  /** Pokédex Distance oculto con {@code p1} (host), {@code p2} y {@code p3} ya en la primera ronda. */
  private static LiveRoom distanceRound(RoomTestKit kit, int roundSeconds) {
    var room = kit.room(8, guest("p1", "Uno"), guest("p2", "Dos"), guest("p3", "Tres"));
    kit.manager.updateConfig("p1", json("{\"generations\":[1],\"roundSeconds\":" + roundSeconds
        + ",\"selectionVisibility\":\"HIDDEN\"}"));
    kit.startReady(room, "p1");
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    return room;
  }

  private static void select(RoomTestKit kit, String playerId, String pokemonId) {
    kit.manager.action(playerId, json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"" + pokemonId + "\"}"));
  }

  @Test
  @DisplayName("a disconnect shorter than the presence grace keeps the player in the round")
  void presenceGraceKeepsAShortDisconnectInTheRound() {
    var kit = new RoomTestKit();
    var room = distanceRound(kit, 20);
    kit.manager.disconnect("p3", "socket-p3");
    select(kit, "p1", "bulbasaur");
    select(kit, "p2", "charmander");
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    kit.time.advance(5_000);
    assertTrue(kit.manager.connect(guest("p3", "Tres"), "socket-p3-b"));
    assertNull(room.members.get("p3").presenceGraceTimer);
    assertEquals(0, room.members.get("p3").disconnectedAt);
    select(kit, "p3", "squirtle");
    var lastRound = kit.publicGame(room, "p1").get("lastRound");
    assertNotNull(lastRound);
    assertNotEquals("NO_RESPONSE", lastRound.get("reason").getStringValue());
    assertTrue(JsonTree.equal(json("[\"p1\"]"), lastRound.get("eliminatedIds")));
  }

  @Test
  @DisplayName("the engine sees the disconnect exactly when the presence grace expires")
  void presenceGraceExpiresAndTheEngineSeesTheDisconnect() {
    var kit = new RoomTestKit();
    var room = distanceRound(kit, 60);
    kit.manager.disconnect("p3", "socket-p3");
    assertTrue(kit.manager.context(room).isPlayerRequired("p3"));
    select(kit, "p1", "bulbasaur");
    select(kit, "p2", "charmander");
    kit.time.advance(9_999);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    kit.time.advance(1);
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    var lastRound = kit.publicGame(room, "p1").get("lastRound");
    assertEquals("NO_RESPONSE", lastRound.get("reason").getStringValue());
    assertTrue(JsonTree.equal(json("[\"p3\"]"), lastRound.get("eliminatedIds")));
    assertFalse(kit.manager.context(room).isPlayerRequired("p3"));
    assertNull(room.members.get("p3").presenceGraceTimer);
  }

  @Test
  @DisplayName("the presence grace never extends the round deadline")
  void presenceGraceNeverExtendsTheRound() {
    var kit = new RoomTestKit();
    var room = distanceRound(kit, 20);
    long roundEndsAt = kit.publicGame(room, "p1").get("roundEndsAt").getLongValue();
    kit.time.advance(15_000);
    kit.manager.disconnect("p3", "socket-p3");
    select(kit, "p1", "bulbasaur");
    select(kit, "p2", "charmander");
    kit.time.advance(roundEndsAt - kit.time.now() - 1);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    kit.time.advance(1 + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    assertTrue(kit.time.now() < room.members.get("p3").disconnectedAt + 10_000);
    var lastRound = kit.publicGame(room, "p1").get("lastRound");
    assertEquals("NO_RESPONSE", lastRound.get("reason").getStringValue());
    assertTrue(JsonTree.equal(json("[\"p3\"]"), lastRound.get("eliminatedIds")));
  }

  @Test
  @DisplayName("a shorter reconnect grace ends the presence grace when the player leaves")
  void presenceGraceEndsEarlyWhenThePlayerLeaves() {
    var kit = new RoomTestKit(new RoomSettings(8, 5_000));
    var room = distanceRound(kit, 60);
    kit.manager.disconnect("p3", "socket-p3");
    select(kit, "p1", "bulbasaur");
    select(kit, "p2", "charmander");
    kit.time.advance(4_999);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    kit.time.advance(1);
    assertEquals(PresenceStatus.LEFT, room.members.get("p3").presence);
    assertNull(room.members.get("p3").presenceGraceTimer);
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    var lastRound = kit.publicGame(room, "p1").get("lastRound");
    assertEquals("NO_RESPONSE", lastRound.get("reason").getStringValue());
    assertTrue(JsonTree.equal(json("[\"p3\"]"), lastRound.get("eliminatedIds")));
    var broadcasts = kit.events.named("room:state").size();
    kit.time.advance(5_000);
    assertEquals(broadcasts, kit.events.named("room:state").size());
  }

  @Test
  @DisplayName("games without a presence grace see a disconnect immediately")
  void gamesWithoutGraceSeeDisconnectsImmediately() {
    var kit = new RoomTestKit("whos-that-pokemon");
    var room = kit.room(8, guest("p1", "Uno"), guest("p2", "Dos"), guest("p3", "Tres"));
    kit.manager.selectGame("p1", "whos-that-pokemon");
    kit.startReady(room, "p1");
    assertNotNull(room.game);
    kit.manager.disconnect("p3", "socket-p3");
    assertFalse(kit.manager.context(room).isPlayerRequired("p3"));
    assertNull(room.members.get("p3").presenceGraceTimer);
  }

  /** Type Duel real (sin motores falsos) con {@code p1} (host) y {@code p2} como duelistas del primer duelo. */
  private static LiveRoom typeDuelRoom(RoomTestKit kit) {
    var room = kit.room(8, guest("p1", "Uno"), guest("p2", "Dos"));
    kit.manager.selectGame("p1", "type-duel");
    // Plazos más largos que la gracia: lo que resuelve el duelo es la presencia, no el tiempo.
    kit.manager.updateConfig("p1", json("{\"generations\":[1],\"typeSelectSeconds\":30,\"searchSeconds\":60,"
        + "\"rounds\":3}"));
    kit.startReady(room, "p1");
    assertEquals("SELECTING_TYPES", kit.publicGame(room, "p1").get("phase").getStringValue());
    return room;
  }

  private static RoomTestKit typeDuelKit() {
    var engines = new LinkedHashMap<String, GameEngine<?, ?, ?, ?>>();
    for (var id : List.of("higher-lower", "pokedex-distance", "type-duel")) {
      engines.put(id, RoomTestKit.REAL_REGISTRY.engine(id).orElseThrow());
    }
    return new RoomTestKit(50_000, UserGameConfigPreferences.NO_OP, HostContentProvider.EMPTY,
        RoomTestKit.REAL_REGISTRY.withEngines(engines));
  }

  private static void assertDuelAlive(RoomTestKit kit, LiveRoom room, String phase) {
    var game = kit.publicGame(room, "p1");
    assertEquals(phase, game.get("phase").getStringValue());
    var lastRound = game.get("lastRound");
    assertTrue(lastRound == null || lastRound.isNull());
    assertEquals(0, game.get("completedRounds").getIntValue());
  }

  @Test
  @DisplayName("a duelist who comes back within the presence grace keeps the duel alive")
  void presenceGraceReconnectKeepsTheDuelAlive() {
    var kit = typeDuelKit();
    var room = typeDuelRoom(kit);
    // Elección de tipos: se cae y vuelve a los 9 s.
    kit.manager.disconnect("p2", "socket-p2");
    kit.time.advance(9_000);
    assertTrue(kit.manager.connect(guest("p2", "Dos"), "socket-p2-b"));
    kit.time.advance(5_000);
    assertDuelAlive(kit, room, "SELECTING_TYPES");
    // Búsqueda: lo mismo con la carrera en marcha.
    kit.manager.action("p1", json("{\"type\":\"SELECT_TYPE\",\"pokemonType\":\"fire\"}"));
    kit.manager.action("p2", json("{\"type\":\"SELECT_TYPE\",\"pokemonType\":\"flying\"}"));
    kit.passDeadline(room);
    assertDuelAlive(kit, room, "POKEMON_SEARCH");
    kit.manager.disconnect("p2", "socket-p2-b");
    kit.time.advance(9_000);
    assertTrue(kit.manager.connect(guest("p2", "Dos"), "socket-p2-c"));
    kit.time.advance(5_000);
    assertDuelAlive(kit, room, "POKEMON_SEARCH");
  }

  @Test
  @DisplayName("a duelist who does not come back within the presence grace forfeits the duel")
  void presenceGraceExpiryForfeitsTheDuel() {
    var kit = typeDuelKit();
    var room = typeDuelRoom(kit);
    kit.manager.disconnect("p2", "socket-p2");
    kit.time.advance(9_999);
    assertDuelAlive(kit, room, "SELECTING_TYPES");
    kit.time.advance(1);
    var game = kit.publicGame(room, "p1");
    assertEquals("ROUND_RESULTS", game.get("phase").getStringValue());
    var lastRound = game.get("lastRound");
    assertEquals("DISCONNECT_FORFEIT", lastRound.get("reason").getStringValue());
    assertEquals("p1", lastRound.get("winnerId").getStringValue());
    assertTrue(JsonTree.equal(json("[\"p2\"]"), lastRound.get("disconnectedIds")));
    assertTrue(JsonTree.equal(json("{\"p1\":5,\"p2\":0}"), game.get("scores")));
  }

  @Test
  @DisplayName("each player has their own presence grace")
  void presenceGraceIsPerPlayer() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("p1", "Uno"), guest("p2", "Dos"), guest("p3", "Tres"), guest("p4", "Cuatro"));
    kit.manager.updateConfig("p1", json("{\"generations\":[1],\"roundSeconds\":60,\"selectionVisibility\":\"HIDDEN\"}"));
    kit.startReady(room, "p1");
    kit.manager.disconnect("p3", "socket-p3");
    kit.time.advance(4_000);
    kit.manager.disconnect("p4", "socket-p4");
    select(kit, "p1", "bulbasaur");
    select(kit, "p2", "charmander");
    kit.time.advance(6_000);
    assertFalse(kit.manager.context(room).isPlayerRequired("p3"));
    assertTrue(kit.manager.context(room).isPlayerRequired("p4"));
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    kit.time.advance(4_000);
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    var lastRound = kit.publicGame(room, "p1").get("lastRound");
    assertEquals("NO_RESPONSE", lastRound.get("reason").getStringValue());
    assertTrue(JsonTree.equal(json("[\"p3\",\"p4\"]"), lastRound.get("eliminatedIds")));
  }

  @Test
  @DisplayName("ending the game during a presence grace cancels the pending grace timer")
  void gameEndCancelsPresenceGrace() {
    var fixture = activeSkipFixture(3, 10);
    var kit = fixture.kit();
    var room = fixture.room();
    var game = room.game;
    fixture.setVote("skip-p3", true);
    kit.manager.disconnect("skip-p3", "skip-socket-3");
    var member = room.members.get("skip-p3");
    assertNotNull(member.presenceGraceTimer);
    fixture.setVote("skip-p1", true);
    fixture.setVote("skip-p2", true);
    assertNotNull(game.finishReason);
    assertNull(member.presenceGraceTimer);
    assertTrue(member.disconnectTimer != null);
  }

  @Test
  @DisplayName("a short blip of the only non-voter never makes the skip unanimous")
  void presenceGraceBlipKeepsTheSkipVoteOpen() {
    var fixture = activeSkipFixture(3, 10);
    var kit = fixture.kit();
    var room = fixture.room();
    var game = room.game;
    fixture.setVote("skip-p1", true);
    fixture.setVote("skip-p2", true);
    kit.manager.disconnect("skip-p3", "skip-socket-3");
    assertSame(game, room.game);
    assertNull(game.finishReason);
    kit.time.advance(2_000);
    assertTrue(kit.manager.connect(guest("skip-p3", "Player 3"), "skip-socket-3b"));
    assertSame(game, room.game);
    assertNull(game.finishReason);
    kit.manager.disconnect("skip-p3", "skip-socket-3b");
    kit.time.advance(10_000);
    assertSame(game, room.game);
    assertNull(game.finishReason);
  }

  @Test
  @DisplayName("a disconnect from an earlier game never grants grace in the next one")
  void presenceGraceDoesNotLeakIntoTheNextGame() {
    var fixture = activeSkipFixture(3, 10);
    var kit = fixture.kit();
    var room = fixture.room();
    var first = room.game;
    fixture.setVote("skip-p3", true);
    kit.manager.disconnect("skip-p3", "skip-socket-3");
    fixture.setVote("skip-p1", true);
    fixture.setVote("skip-p2", true);
    assertNotSame(first, room.game);
    assertNotNull(room.game);
    assertFalse(kit.manager.context(room).isPlayerRequired("skip-p3"));
  }

  @Test
  @DisplayName("broadcasts avatar changes and keeps the lightweight reference in the room")
  void broadcastsAvatarChanges() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"));
    kit.manager.updateIdentityAvatar("host", new AvatarRef.Preset("trainer-aqua"));
    assertEquals(new AvatarRef.Preset("trainer-aqua"), room.members.get("host").identity.avatar());
    var state = kit.events.lastStateFor("host");
    assertEquals("socket-host", kit.events.named("room:state").getLast().connectionId());
    assertEquals(new AvatarRef.Preset("trainer-aqua"), state.members().getFirst().avatar());
    assertTrue(serialize(state).contains("\"avatar\":{\"type\":\"PRESET\",\"value\":\"trainer-aqua\"}"));
  }

  @Test
  @DisplayName("re-broadcasts room:state with the new custom category count only when the user hosts the room")
  void rebroadcastsHostCategories() {
    var categories = new LinkedHashMap<String, List<SubjectiveCategory>>();
    var content = new HostContentProvider() {
      @Override
      public List<SubjectiveCategory> customCategoriesForUser(String userId) {
        return categories.getOrDefault(userId, List.of());
      }

      @Override
      public List<WouldYouRatherPromptPair> wouldYouRatherPromptsForUser(
          String userId) {
        return List.of();
      }
    };
    var kit = new RoomTestKit(50_000, UserGameConfigPreferences.NO_OP, content, RoomTestKit.registry());
    var host = user("host-user", "Host", "host@example.com");
    var member = user("member-user", "Ana", "ana@example.com");
    kit.room(8, host, member);
    assertEquals(0, kit.events.lastStateFor("host-user").hostCustomCategoryCount());
    kit.events.clear();

    categories.put("host-user", List.of(new SubjectiveCategory("c1", "Uno"),
        new SubjectiveCategory("c2", "Dos")));
    kit.manager.updateHostCategories("host-user");
    assertEquals(2, kit.events.named("room:state").size());
    assertEquals(2, kit.events.lastStateFor("host-user").hostCustomCategoryCount());
    assertEquals(2, kit.events.lastStateFor("member-user").hostCustomCategoryCount());

    kit.events.clear();
    categories.put("member-user", List.of(new SubjectiveCategory("c3", "Tres")));
    kit.manager.updateHostCategories("member-user");
    kit.manager.updateHostCategories("nobody");
    assertTrue(kit.events.sent.isEmpty());
  }

  @Test
  @DisplayName("re-broadcasts room:state with the new Would You Rather prompt count only when the user hosts the room")
  void rebroadcastsHostWouldYouRatherPrompts() {
    var prompts = new LinkedHashMap<String, List<WouldYouRatherPromptPair>>();
    var content = new HostContentProvider() {
      @Override
      public List<SubjectiveCategory> customCategoriesForUser(String userId) {
        return List.of();
      }

      @Override
      public List<WouldYouRatherPromptPair> wouldYouRatherPromptsForUser(String userId) {
        return prompts.getOrDefault(userId, List.of());
      }
    };
    var kit = new RoomTestKit(50_000, UserGameConfigPreferences.NO_OP, content, RoomTestKit.registry());
    var host = user("host-user", "Host", "host@example.com");
    var member = user("member-user", "Ana", "ana@example.com");
    kit.room(8, host, member);
    assertEquals(0, kit.events.lastStateFor("host-user").hostWouldYouRatherPromptCount());
    kit.events.clear();

    prompts.put("host-user", List.of(new WouldYouRatherPromptPair("w1", "Vivir con Gengar", "Viajar con Magikarp")));
    kit.manager.updateHostWouldYouRatherPrompts("host-user");
    assertEquals(2, kit.events.named("room:state").size());
    assertEquals(1, kit.events.lastStateFor("host-user").hostWouldYouRatherPromptCount());
    assertEquals(1, kit.events.lastStateFor("member-user").hostWouldYouRatherPromptCount());

    kit.events.clear();
    prompts.put("member-user", List.of(new WouldYouRatherPromptPair("w2", "Elegir a Eevee", "Elegir a Mew")));
    kit.manager.updateHostWouldYouRatherPrompts("member-user");
    kit.manager.updateHostWouldYouRatherPrompts("nobody");
    assertTrue(kit.events.sent.isEmpty());
  }

  // --------------------------------------------------------------------------------------- roles y permisos

  @Test
  @DisplayName("rejects Members changing games and rejects unknown ids without altering the registry")
  void rejectsMembersAndUnknownGames() {
    var kit = new RoomTestKit();
    var created = kit.manager.create(guest("host", "Host"), "socket-host", JsonNode.createNumberNode(8));
    var room = kit.manager.store.get(created.code());
    kit.manager.join(guest("guest", "Guest"), "socket-guest", room.code);
    assertMessage("No tienes permiso para realizar esta acción.", () -> kit.manager.selectGame("guest", "higher-lower"));
    assertMessage("Unknown game", () -> kit.manager.selectGame("host", "missing-game"));
    assertEquals("pokedex-distance", room.selectedGameId);
    assertEquals(28, created.availableGames().size());
  }

  @Test
  @DisplayName("centralizes Host, Co-host and Member permissions and broadcasts role changes")
  void centralizesPermissions() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("cohost", "Pedro"), guest("member", "Ana"));
    assertEquals(RoomRole.HOST, room.members.get("host").roomRole);
    assertEquals(RoomRole.MEMBER, room.members.get("cohost").roomRole);
    assertMessage("No tienes permiso para realizar esta acción.",
        () -> kit.manager.setRoomRole("member", "cohost", JsonNode.createStringNode("CO_HOST")));
    assertTrue(rejects(() -> kit.manager.setRoomRole("host", "cohost", JsonNode.createStringNode("HOST")))
        .getMessage().contains("Invalid option: expected one of \\\"CO_HOST\\\"|\\\"MEMBER\\\""));

    kit.manager.setRoomRole("host", "cohost", JsonNode.createStringNode("CO_HOST"));
    assertEquals(RoomRole.CO_HOST, room.members.get("cohost").roomRole);
    assertTrue(kit.events.lastStateFor("host").members().stream()
        .anyMatch(m -> m.id().equals("cohost") && m.roomRole() == RoomRole.CO_HOST));
    kit.manager.selectGame("cohost", "higher-lower");
    kit.manager.updateConfig("cohost", json(RoomTestKit.HIGHER_LOWER_1_ROUND));
    var invalid = rejects(() -> kit.manager.updateConfig("cohost", json("{\"generations\":[1],\"roundSeconds\":2}")));
    assertTrue(invalid.getMessage().startsWith("Configuración de Higher or Lower no válida"), invalid.getMessage());
    kit.manager.updateSession("cohost", json("{\"type\":\"GAME_COUNT\",\"target\":5}"));
    assertEquals("higher-lower", room.selectedGameId);
    assertEquals(new SessionMode.GameCount(5), room.sessionMode);
    assertMessage("No tienes permiso para realizar esta acción.", () -> kit.manager.startGame("cohost"));
    assertMessage("No tienes permiso para realizar esta acción.", () -> kit.manager.kick("cohost", "member"));
    assertMessage("No tienes permiso para realizar esta acción.",
        () -> kit.manager.setRoomRole("cohost", "member", JsonNode.createStringNode("CO_HOST")));
    assertMessage("No tienes permiso para realizar esta acción.",
        () -> kit.manager.updateConfig("member", room.gameConfigs.get("higher-lower")));
    assertMessage("El Host no puede cambiar su propio rol.",
        () -> kit.manager.setRoomRole("host", "host", JsonNode.createStringNode("MEMBER")));
    assertMessage("Jugador no encontrado.",
        () -> kit.manager.setRoomRole("host", "ghost", JsonNode.createStringNode("MEMBER")));

    kit.manager.setRoomRole("host", "cohost", JsonNode.createStringNode("MEMBER"));
    assertEquals(RoomRole.MEMBER, room.members.get("cohost").roomRole);
    assertMessage("El Host no puede expulsarse a sí mismo.", () -> kit.manager.kick("host", "host"));
    assertMessage("Player not found", () -> kit.manager.kick("host", "ghost"));
    kit.manager.kick("host", "member");
    assertFalse(room.members.containsKey("member"));
    assertNull(kit.manager.store.roomForPlayer("member"));
    assertEquals(List.of(new RecordingEvents.Kicked("member", "socket-member", "El host te ha expulsado de la sala.")),
        kit.events.kicked);
  }

  @Test
  @DisplayName("transfers Host manually, makes the old Host Co-host and preserves roles across games and reconnects")
  void transfersHostManually() {
    var kit = new RoomTestKit(5_000, UserGameConfigPreferences.NO_OP);
    var oldHost = guest("old-host", "Eru");
    var nextHost = guest("next-host", "Pedro");
    var room = kit.manager.store.get(kit.manager.create(oldHost, "old-socket", JsonNode.createNumberNode(8)).code());
    kit.manager.join(nextHost, "next-socket", room.code);
    assertMessage("Ya eres el Host.", () -> kit.manager.transferHost(oldHost.id(), oldHost.id()));
    assertMessage("Solo puedes transferir el Host a un jugador conectado.",
        () -> kit.manager.transferHost(oldHost.id(), "ghost"));
    kit.manager.transferHost(oldHost.id(), nextHost.id());
    assertEquals(nextHost.id(), room.hostId);
    assertEquals(RoomRole.HOST, room.members.get(nextHost.id()).roomRole);
    assertEquals(RoomRole.CO_HOST, room.members.get(oldHost.id()).roomRole);
    assertMessage("No tienes permiso para realizar esta acción.", () -> kit.manager.startGame(oldHost.id()));
    kit.manager.selectGame(oldHost.id(), "higher-lower");
    kit.manager.selectGame(oldHost.id(), "pokedex-distance");
    assertEquals(RoomRole.CO_HOST, room.members.get(oldHost.id()).roomRole);

    kit.manager.disconnect(oldHost.id(), "old-socket");
    kit.manager.connect(oldHost, "old-restored");
    var restored = room.members.get(oldHost.id());
    assertEquals(RoomRole.CO_HOST, restored.roomRole);
    assertEquals(PresenceStatus.CONNECTED, restored.presence);
    assertEquals("old-restored", restored.connectionId);
    kit.startReady(room, nextHost.id());
    kit.manager.action(nextHost.id(), json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"bulbasaur\"}"));
    kit.manager.action(oldHost.id(), json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"ivysaur\"}"));
    while (room.phase != RoomPhase.GAME_RESULTS) {
      if (room.phase == RoomPhase.ROUND_ACTIVE || room.phase == RoomPhase.TIEBREAKER_ACTIVE) {
        for (var id : List.of(nextHost.id(), oldHost.id())) {
          try {
            kit.manager.action(id, json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"charmander\"}"));
          } catch (RoomException ignored) {
            // eliminado o selección repetida
          }
        }
      }
      if (room.phase != RoomPhase.GAME_RESULTS) kit.passDeadline(room);
    }
    kit.manager.returnLobby(nextHost.id());
    assertEquals(RoomRole.CO_HOST, room.members.get(oldHost.id()).roomRole);
    assertEquals(RoomRole.HOST, room.members.get(nextHost.id()).roomRole);
  }

  @Test
  @DisplayName("requires connected guests to confirm once and preserves readiness across lobby configuration changes")
  void readinessRules() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    assertMessage("Falta por confirmar: Ana.", () -> kit.manager.startGame("host"));
    assertMessage("El host inicia la partida y no necesita marcarse como listo.",
        () -> kit.manager.setReady("host", true));
    assertMessage("Estado de preparación inválido.",
        () -> kit.manager.setReady("guest", JsonNode.createStringNode("yes")));

    kit.manager.setReady("guest", true);
    assertTrue(room.members.get("guest").ready);
    kit.manager.selectGame("host", "higher-lower");
    assertTrue(room.members.get("guest").ready);
    kit.manager.updateConfig("host", json(RoomTestKit.HIGHER_LOWER_1_ROUND));
    assertTrue(room.members.get("guest").ready);
    kit.manager.updateSession("host", json("{\"type\":\"GAME_COUNT\",\"target\":5}"));
    assertTrue(room.members.get("guest").ready);
    kit.manager.updateGameSelection("host",
        json("{\"type\":\"RANDOM\",\"gameIds\":[\"pokedex-distance\",\"higher-lower\"]}"));
    assertTrue(room.members.get("guest").ready);

    kit.manager.startGame("host");
    assertNotEquals(RoomPhase.LOBBY, room.phase);
    assertTrue(room.members.values().stream().noneMatch(member -> member.ready));
  }

  @Test
  @DisplayName("lists at most three pending names and counts the rest")
  void formatsPendingReadyNames() {
    var kit = new RoomTestKit();
    kit.room(8, guest("host", "Host"), guest("a", "Ana"), guest("b", "Bea"), guest("c", "Carla"), guest("d", "Dani"),
        guest("e", "Eva"));
    assertMessage("Falta por confirmar: Ana, Bea, Carla y 2 más.", () -> kit.manager.startGame("host"));
    assertMessage("This setting can only be changed in the lobby", () -> {
      var room = kit.manager.store.roomForPlayer("host");
      room.phase = RoomPhase.ROUND_ACTIVE;
      kit.manager.selectGame("host", "higher-lower");
    });
  }

  // ------------------------------------------------------------------------------------------- partidas

  @Test
  @DisplayName("plays Higher or Lower and Pokédex Distance consecutively without recreating the room")
  void playsConsecutiveGames() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Guest"));
    kit.selectHigherLower("host");
    kit.startReady(room, "host");
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    assertEquals(RoomPhase.ROUND_ACTIVE, kit.events.lastStateFor("guest").phase());
    kit.manager.action("host", answer("HIGHER"));
    kit.manager.action("guest", answer("LOWER"));
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    kit.passDeadline(room);
    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
    assertEquals(1, room.gamesPlayed);
    assertEquals(GameFinishReason.COMPLETED, room.game.finishReason);
    kit.manager.flush();
    assertEquals(1, kit.persister.calls.size());
    assertEquals(room.game.resultId, kit.persister.calls.getFirst().resultId());
    var persisted = kit.persister.calls.getFirst().results();
    var live = room.game.engine.getResults(room.game.state);
    assertEquals(live, persisted);
    for (int index = 0; index < live.standings().size(); index++) {
      assertTrue(live.standings().get(index).stats() != persisted.standings().get(index).stats(),
          "copia profunda como structuredClone");
    }
    kit.manager.returnLobby("host");

    kit.manager.selectGame("host", "pokedex-distance");
    kit.manager.updateConfig("host", json("{\"generations\":[1],\"roundSeconds\":10,\"selectionVisibility\":\"HIDDEN\"}"));
    kit.startReady(room, "host");
    assertEquals("pokedex-distance", room.game.gameId);
    var view = kit.manager.view(room, "guest");
    assertNotNull(view.game().get("targetDexNumber"));
    assertMessage("Game has not finished", () -> kit.manager.returnLobby("host"));
  }

  @Test
  @DisplayName("continues a fixed session by starting the same minigame without returning to the lobby")
  void continuesFixedSession() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.selectHigherLower("host");
    kit.startReady(room, "host");
    kit.manager.action("host", answer("HIGHER"));
    kit.manager.action("guest", answer("LOWER"));
    kit.passDeadline(room);
    var firstResultId = room.game.resultId;
    assertMessage("Game has not finished", () -> {
      room.phase = RoomPhase.LOBBY;
      try {
        kit.manager.returnLobby("host");
      } finally {
        room.phase = RoomPhase.GAME_RESULTS;
      }
    });

    kit.manager.continueSession("host");

    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    assertEquals("higher-lower", room.game.gameId);
    assertFalse(room.game.resultsApplied);
    assertNotEquals(firstResultId, room.game.resultId);
    assertEquals(1, room.gamesPlayed);
    assertMessage("La partida todavía no ha terminado.", () -> kit.manager.continueSession("host"));
  }

  @Test
  @DisplayName("keeps public session history and departed players in the final standings until a new session")
  void keepsSessionHistoryAndDepartedStandings() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.selectHigherLower("host");
    kit.startReady(room, "host");
    kit.manager.action("host", answer("HIGHER"));
    kit.manager.action("guest", answer("LOWER"));
    kit.passDeadline(room);
    kit.manager.endSession("host");

    assertEquals(1, room.sessionHistory.size());
    SessionGameSummary summary = room.sessionHistory.getFirst();
    assertEquals(1, summary.gameNumber());
    assertEquals("higher-lower", summary.gameId());
    assertEquals(1, summary.winnerIds().size());
    assertEquals("POSITION_V1", summary.scoringVersion());
    assertEquals(Set.of("host", "guest"), summary.points().keySet());
    assertEquals(Set.of("host", "guest"), summary.rawPoints().keySet());
    kit.manager.leave("guest");
    var finalView = kit.manager.view(room, "host");
    assertEquals(List.of("host"), finalView.members().stream().map(RoomView.MemberView::id).toList());
    assertTrue(finalView.sessionStandings().stream().anyMatch(s -> s.id().equals("guest") && s.displayName().equals("Ana")));

    kit.manager.returnLobby("host");
    assertTrue(room.sessionHistory.isEmpty());
    var standings = kit.manager.view(room, "host").sessionStandings();
    assertEquals(1, standings.size());
    assertEquals("host", standings.getFirst().id());
    assertEquals(0, standings.getFirst().sessionPoints());
  }

  @Test
  @DisplayName("bounds detailed history for infinite sessions while keeping the full game count")
  void boundsSessionHistory() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    room.gamesPlayed = 100;
    for (int index = 0; index < 100; index++) {
      room.sessionHistory.add(new SessionGameSummary(index + 1, "higher-lower", List.of("host"), null,
          Map.of("host", 1, "guest", 0), null));
    }
    kit.selectHigherLower("host");
    kit.startReady(room, "host");
    kit.manager.action("host", answer("HIGHER"));
    kit.manager.action("guest", answer("LOWER"));
    kit.passDeadline(room);
    assertEquals(101, room.gamesPlayed);
    assertEquals(100, room.sessionHistory.size());
    assertEquals(2, room.sessionHistory.getFirst().gameNumber());
    assertEquals(101, room.sessionHistory.getLast().gameNumber());
    assertFalse(serialize(kit.manager.view(room, "host").sessionHistory().getFirst()).contains("rawPoints"));
  }

  @Test
  @DisplayName("ends the session by game count after the target number of games")
  void sessionResultsByGameCount() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.selectHigherLower("host");
    kit.manager.updateSession("host", json("{\"type\":\"GAME_COUNT\",\"target\":2}"));
    kit.startReady(room, "host");
    kit.passDeadline(room);
    kit.passDeadline(room);
    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
    kit.manager.continueSession("host");
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    kit.passDeadline(room);
    kit.passDeadline(room);
    assertEquals(2, room.gamesPlayed);
    kit.manager.continueSession("host");
    assertEquals(RoomPhase.SESSION_RESULTS, room.phase);
    assertNull(room.game);
    assertMessage("Cannot end the session during a game", () -> kit.manager.endSession("host"));
    kit.manager.returnLobby("host");
    assertEquals(0, room.gamesPlayed);
  }

  @Test
  @DisplayName("ends the session when a participant reaches the point target")
  void sessionResultsByPointTarget() {
    var kit = new RoomTestKit("shiny-vote");
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.manager.selectGame("host", "shiny-vote");
    kit.manager.updateSession("host", json("{\"type\":\"POINT_TARGET\",\"target\":5}"));
    assertTrue(rejects(() -> kit.manager.updateSession("host", json("{\"type\":\"POINT_TARGET\",\"target\":4}")))
        .getMessage().contains("Too small: expected number to be >=5"));
    kit.startReady(room, "host");
    kit.manager.action("host", json("{\"type\":\"SCORE\",\"points\":3}"));
    kit.manager.action("host", json("{\"type\":\"FINISH\"}"));
    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
    assertEquals(4, room.members.get("host").sessionPoints); // 2 jugadores: 1.º = 2 × 2
    assertEquals(0, room.members.get("guest").sessionPoints); // 0 puntos brutos → 0 de sesión
    kit.manager.continueSession("host");
    kit.manager.action("host", json("{\"type\":\"SCORE\",\"points\":1}"));
    kit.manager.action("host", json("{\"type\":\"FINISH\"}"));
    assertEquals(8, room.sessionParticipants.get("host").sessionPoints);
    kit.manager.continueSession("host");
    assertEquals(RoomPhase.SESSION_RESULTS, room.phase);
  }

  @Test
  @DisplayName("keeps a finished session terminal when a stale game timer fires")
  void finishedSessionStaysTerminal() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"));
    kit.selectHigherLower("host");
    kit.startReady(room, "host");
    kit.manager.action("host", answer("HIGHER"));
    kit.passDeadline(room);
    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
    kit.manager.endSession("host");
    kit.manager.tick(room);
    assertEquals(RoomPhase.SESSION_RESULTS, room.phase);
  }

  @Test
  @DisplayName("advances expired game time before processing an action and immediately publishes the transition")
  void advancesExpiredTimeBeforeAction() {
    var fixture = activeSkipFixture(2, 10);
    var kit = fixture.kit();
    var room = fixture.room();
    var game = room.game;
    kit.time.set(game.engine.getLifecycle(game.state).nextDeadline());
    kit.events.clear();
    assertMessage("El tiempo ha terminado; la fase o el turno ha cambiado.",
        () -> kit.manager.action("skip-p1", answer("HIGHER")));
    assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
    assertEquals(RoomPhase.ROUND_RESULTS, kit.events.lastStateFor("skip-p2").phase());
    assertEquals(0, kit.publicGame(room, "skip-p1").get("answers").size());
  }

  @Test
  @DisplayName("rejects a delayed action from a previous round through the socket command boundary")
  void rejectsDelayedActionFromPreviousRound() {
    var fixture = activeSkipFixture(2, 10);
    var kit = fixture.kit();
    var room = fixture.room();
    var game = room.game;
    var actionEpoch = game.engine.getLifecycle(game.state).actionEpoch();
    kit.passDeadline(room);
    kit.passDeadline(room);
    assertNotEquals(actionEpoch, game.engine.getLifecycle(game.state).actionEpoch());
    var previous = game.state;
    assertMessage("La ronda o el turno ya ha cambiado.", () -> kit.manager.gameAction("skip-p1",
        json("{\"gameInstanceId\":\"" + game.resultId + "\",\"actionEpoch\":" + JsonTree.quote(actionEpoch)
            + ",\"action\":{\"type\":\"ANSWER\",\"choice\":\"HIGHER\"}}")));
    assertSame(previous, game.state);
  }

  @Test
  @DisplayName("validates the game:action envelope strictly")
  void validatesGameActionEnvelope() {
    var fixture = activeSkipFixture(1, 10);
    var kit = fixture.kit();
    var error = rejects(() -> kit.manager.gameAction("skip-p1", json("{\"gameInstanceId\":\"x\",\"actionEpoch\":\"\"}")));
    assertEquals("""
        [
          {
            "origin": "string",
            "code": "invalid_format",
            "format": "uuid",
            "pattern": "/%s/",
            "path": [
              "gameInstanceId"
            ],
            "message": "Invalid UUID"
          },
          {
            "origin": "string",
            "code": "too_small",
            "minimum": 1,
            "inclusive": true,
            "path": [
              "actionEpoch"
            ],
            "message": "Too small: expected string to have >=1 characters"
          },
          {
            "expected": "nonoptional",
            "code": "invalid_type",
            "path": [
              "action"
            ],
            "message": "Invalid input: expected nonoptional, received undefined"
          }
        ]""".formatted(RoomCommandParsers.UUID_PATTERN.replace("\\", "\\\\")), error.getMessage());
    assertMessage("Acción de Higher or Lower no válida.", () -> kit.manager.action("skip-p1", json("{\"type\":\"NOPE\"}")));
    var pair = activeSkipFixture(2, 10).kit();
    pair.manager.action("skip-p1", answer("HIGHER"));
    assertMessage("Tu respuesta ya está bloqueada.", () -> pair.manager.action("skip-p1", answer("LOWER")));
  }

  @Test
  @DisplayName("turns absent, null and scalar payloads into RoomException like a ZodError ack")
  void malformedPayloadsAreRoomExceptions() {
    var fixture = activeSkipFixture(2, 10);
    var kit = fixture.kit();
    var room = fixture.room();
    var envelope = "{\"gameInstanceId\":\"" + room.game.resultId + "\",\"actionEpoch\":"
        + JsonTree.quote(room.game.engine.getLifecycle(room.game.state).actionEpoch()) + ",\"action\":";
    rejects(() -> kit.manager.gameAction("skip-p1", json(envelope + "null}")));
    rejects(() -> kit.manager.gameAction("skip-p1", json(envelope + "5}")));
    rejects(() -> kit.manager.gameAction("skip-p1", (JsonNode) null));
    rejects(() -> kit.manager.setGameSkipVote("skip-p1", null));
    rejects(() -> kit.manager.setReady("skip-p2", (JsonNode) null));
    var lobby = new RoomTestKit();
    lobby.room(8, guest("host", "Host"));
    rejects(() -> lobby.manager.updateConfig("host", null));
    rejects(() -> lobby.manager.updateConfig("host", JsonNode.createNumberNode(5)));
    rejects(() -> lobby.manager.updateSession("host", null));
    rejects(() -> lobby.manager.updateGameSelection("host", null));
    rejects(() -> lobby.manager.setRoomRole("host", "x", null));
    rejects(() -> lobby.manager.selectGame("host", null));
    rejects(() -> lobby.manager.updateGameConfig("host", null, null));
    rejects(() -> lobby.manager.voteNextGame("host", null));
    rejects(() -> lobby.manager.join(guest("x", "X"), "c", (JsonNode) null));
    rejects(() -> lobby.manager.updateWhoIsWhoCursor("host", "socket-host", null));
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
    assertTrue(serialize(kit.manager.view(room, "skip-p1")).contains("\"game\":{\"gameId\":\"higher-lower\""));
    assertTrue(serialize(kit.manager.view(room, "skip-p1")).contains("\"gamePlayerState\":{"));
  }

  @Test
  @DisplayName("rejects actions without a live game or from spectators")
  void rejectsActionsWithoutGame() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    assertMessage("No game in progress", () -> kit.manager.action("host", answer("HIGHER")));
    assertMessage("El minijuego ya ha cambiado.", () -> kit.manager.gameAction("host",
        json("{\"gameInstanceId\":\"00000000-0000-4000-8000-000000000999\",\"actionEpoch\":\"x\",\"action\":null}")));
    kit.selectHigherLower("host");
    kit.startReady(room, "host");
    kit.manager.join(guest("late", "Late"), "socket-late", room.code);
    assertEquals(MemberRole.SPECTATOR, room.members.get("late").role);
    assertMessage("You cannot act in the current game", () -> kit.manager.action("late", answer("HIGHER")));
  }

  // ---------------------------------------------------------------------------------------- rotación

  @Test
  @DisplayName("validates game-selection pools and lets co-hosts configure the rotation")
  void validatesSelectionPools() {
    var kit = new RoomTestKit("shiny-vote", "pokemon-bingo");
    var room = kit.room(8, guest("host", "Host"), guest("cohost", "Ana"));
    kit.manager.setRoomRole("host", "cohost", JsonNode.createStringNode("CO_HOST"));
    assertTrue(rejects(() -> kit.manager.updateGameSelection("cohost",
        json("{\"type\":\"RANDOM\",\"gameIds\":[\"higher-lower\"]}"))).getMessage().contains("Selecciona al menos 2 minijuegos."));
    assertTrue(rejects(() -> kit.manager.updateGameSelection("cohost",
        json("{\"type\":\"RANDOM\",\"gameIds\":[\"higher-lower\",\"higher-lower\"]}"))).getMessage()
        .contains("Los minijuegos no pueden repetirse."));
    assertTrue(rejects(() -> kit.manager.updateGameSelection("cohost",
        json("{\"type\":\"VOTE\",\"gameIds\":[\"higher-lower\",\"shiny-vote\"]}"))).getMessage()
        .contains("Selecciona al menos 3 minijuegos."));
    assertMessage("Minijuego desconocido: missing", () -> kit.manager.updateGameSelection("cohost",
        json("{\"type\":\"VOTE\",\"gameIds\":[\"higher-lower\",\"shiny-vote\",\"missing\"]}")));
    kit.manager.updateGameSelection("cohost",
        json("{\"type\":\"VOTE\",\"gameIds\":[\"higher-lower\",\"shiny-vote\",\"pokemon-bingo\"]}"));
    assertEquals(new GameSelectionMode.Vote(List.of("higher-lower", "shiny-vote", "pokemon-bingo")),
        room.gameSelectionMode);
    assertTrue(serialize(kit.manager.view(room, "host")).contains(
        "\"gameSelectionMode\":{\"type\":\"VOTE\",\"gameIds\":[\"higher-lower\",\"shiny-vote\",\"pokemon-bingo\"]}"));
  }

  @Test
  @DisplayName("rejects rotation games that do not support the connected player count")
  void rejectsRotationPlayerCount() {
    var kit = new RoomTestKit();
    var people = new ArrayList<AuthUser>();
    people.add(guest("host", "Host"));
    for (int index = 1; index <= 8; index++) people.add(guest("guest-" + index, "Guest " + index));
    var room = kit.room(10, people.toArray(AuthUser[]::new));
    assertMessage("Pokémon Bingo no admite 9 jugadores conectados.", () -> kit.manager.updateGameSelection("host",
        json("{\"type\":\"RANDOM\",\"gameIds\":[\"pokemon-bingo\",\"zoomed-pokemon\"]}")));
    assertEquals(new GameSelectionMode.Fixed(), room.gameSelectionMode);
  }

  /** Kit con el motor real de Pokémon Impostor además de los dos motores reales de siempre. */
  private static RoomTestKit impostorKit() {
    var engines = new LinkedHashMap<String, GameEngine<?, ?, ?, ?>>();
    for (var id : List.of("higher-lower", "pokedex-distance", "pokemon-impostor")) {
      engines.put(id, RoomTestKit.REAL_REGISTRY.engine(id).orElseThrow());
    }
    return new RoomTestKit(50_000, UserGameConfigPreferences.NO_OP, HostContentProvider.EMPTY,
        RoomTestKit.REAL_REGISTRY.withEngines(engines));
  }

  @Test
  @DisplayName("blocks a fixed Pokémon Impostor start with the lobby parity literal")
  void impostorParityBlocksStartWithTheReadinessLiteral() {
    var kit = impostorKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest-1", "Ana"), guest("guest-2", "Bea"),
        guest("guest-3", "Carla"));
    kit.manager.selectGame("host", "pokemon-impostor");
    var config = new LinkedHashMap<>(RoomTestKit.asMap(room.gameConfigs.get("pokemon-impostor")));
    config.put("impostorCount", 2);
    kit.manager.updateConfig("host", RoomTestKit.tree(config));
    assertMessage("Pokémon Impostor: Demasiados impostores: con 4 jugadores el máximo es 1.",
        () -> kit.startReady(room, "host"));
    assertEquals(RoomPhase.LOBBY, room.phase);
  }

  @Test
  @DisplayName("excludes Pokémon Impostor from a random rotation instead of blocking on parity")
  void impostorParityExcludesTheGameFromRotation() {
    var kit = impostorKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest-1", "Ana"), guest("guest-2", "Bea"),
        guest("guest-3", "Carla"));
    var config = new LinkedHashMap<>(RoomTestKit.asMap(room.gameConfigs.get("pokemon-impostor")));
    config.put("impostorCount", 2);
    kit.manager.updateGameConfig("host", "pokemon-impostor", RoomTestKit.tree(config));
    kit.manager.updateGameSelection("host",
        json("{\"type\":\"RANDOM\",\"gameIds\":[\"pokemon-impostor\",\"higher-lower\",\"pokedex-distance\"]}"));
    assertEquals(List.of("higher-lower", "pokedex-distance"),
        kit.manager.playableGameIds(room, List.of("pokemon-impostor", "higher-lower", "pokedex-distance")));
    kit.startReady(room, "host");
    assertNotEquals(RoomPhase.LOBBY, room.phase);
    assertNotEquals("pokemon-impostor", room.selectedGameId);
  }

  @Test
  @DisplayName("selects a compatible random minigame at start and avoids an immediate repeat")
  void selectsRandomAlternative() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.manager.selectGame("host", "higher-lower");
    kit.manager.updateGameSelection("host",
        json("{\"type\":\"RANDOM\",\"gameIds\":[\"higher-lower\",\"pokedex-distance\"]}"));
    kit.startReady(room, "host");
    assertEquals("pokedex-distance", room.selectedGameId);
    assertEquals("pokedex-distance", room.game.gameId);
  }

  @Test
  @DisplayName("continues a random session by choosing and starting a compatible alternative")
  void continuesRandomSession() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.selectHigherLower("host");
    kit.startReady(room, "host");
    kit.manager.action("host", answer("HIGHER"));
    kit.manager.action("guest", answer("LOWER"));
    kit.passDeadline(room);
    room.gameSelectionMode = new GameSelectionMode.Random(List.of("higher-lower", "pokedex-distance"));
    kit.manager.continueSession("host");
    assertEquals("pokedex-distance", room.selectedGameId);
    assertEquals("pokedex-distance", room.game.gameId);
    assertEquals(RoomPhase.ROUND_ACTIVE, room.phase);
  }

  @Test
  @DisplayName("filters next-game vote options against the latest connected player count")
  void filtersVoteOptionsByPlayerCount() {
    var kit = new RoomTestKit("pokemon-bingo", "whos-that-pokemon", "shiny-vote");
    var people = new ArrayList<AuthUser>();
    people.add(guest("host", "Host"));
    for (int index = 1; index <= 8; index++) people.add(guest("guest-" + index, "Guest " + index));
    var room = kit.room(10, people.toArray(AuthUser[]::new));
    room.gameSelectionMode = new GameSelectionMode.Vote(
        List.of("pokemon-bingo", "whos-that-pokemon", "pokedex-distance", "higher-lower", "shiny-vote"));
    assertTrue(kit.manager.beginNextGameVote(room));
    assertEquals(Set.of("pokedex-distance", "higher-lower", "shiny-vote"), Set.copyOf(room.nextGameVote.optionGameIds));
  }

  @Test
  @DisplayName("rejects a vote when a new connection makes its minigame incompatible")
  void rejectsIncompatibleVote() {
    var kit = new RoomTestKit("pokemon-bingo", "whos-that-pokemon", "zoomed-pokemon");
    var people = new ArrayList<AuthUser>();
    people.add(guest("host", "Host"));
    for (int index = 1; index <= 7; index++) people.add(guest("guest-" + index, "Guest " + index));
    var room = kit.room(10, people.toArray(AuthUser[]::new));
    room.gameSelectionMode = new GameSelectionMode.Vote(List.of("pokemon-bingo", "whos-that-pokemon", "zoomed-pokemon"));
    assertTrue(kit.manager.beginNextGameVote(room));
    kit.manager.join(guest("guest-8", "Guest 8"), "socket-guest-8", room.code);
    assertMessage("Ese minijuego ya no admite el número actual de jugadores.",
        () -> kit.manager.voteNextGame("host", "pokemon-bingo"));
  }

  @Test
  @DisplayName("runs a private next-game vote, closes early and starts the winner after reveal")
  void runsPrivateNextGameVote() {
    var kit = new RoomTestKit("shiny-vote", "pokemon-bingo");
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.selectHigherLower("host");
    kit.manager.updateGameSelection("host",
        json("{\"type\":\"VOTE\",\"gameIds\":[\"higher-lower\",\"shiny-vote\",\"pokemon-bingo\"]}"));
    kit.startReady(room, "host");
    kit.manager.action("host", answer("HIGHER"));
    kit.manager.action("guest", answer("LOWER"));
    kit.passDeadline(room);

    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
    assertNull(room.nextGameVote);
    assertEquals(2, kit.publicGame(room, "guest").get("results").get("standings").size());
    kit.manager.continueSession("host");
    assertEquals(RoomPhase.NEXT_GAME_VOTE, room.phase);
    assertEquals(3, room.nextGameVote.optionGameIds.size());
    assertEquals(kit.time.now() + 15_000, room.nextGameVote.endsAt);
    var guestVote = kit.manager.view(room, "guest").nextGameVote();
    assertNull(guestVote.ownVoteGameId());
    assertNull(guestVote.tallies());
    assertEquals(List.of(), guestVote.votedPlayerIds());
    assertEquals(3, guestVote.options().size());
    assertTrue(serialize(guestVote).contains("\"tallies\":null"));
    assertFalse(serialize(guestVote).contains("defaultConfig"));

    var hostChoice = room.nextGameVote.optionGameIds.get(0);
    var guestChoice = room.nextGameVote.optionGameIds.get(1);
    assertMessage("Ese minijuego no es una opción válida.", () -> kit.manager.voteNextGame("host", "type-duel"));
    kit.manager.voteNextGame("host", hostChoice);
    assertMessage("Tu voto ya está bloqueado.", () -> kit.manager.voteNextGame("host", guestChoice));
    assertEquals(hostChoice, kit.manager.view(room, "host").nextGameVote().ownVoteGameId());
    var hidden = kit.manager.view(room, "guest").nextGameVote();
    assertNull(hidden.ownVoteGameId());
    assertNull(hidden.tallies());
    assertEquals(List.of("host"), hidden.votedPlayerIds());
    kit.manager.disconnect("host", "socket-host");
    kit.manager.connect(guest("host", "Host"), "host-restored");
    var restored = (RoomView) kit.events.named("session:restored").getLast().payload();
    assertEquals(hostChoice, restored.nextGameVote().ownVoteGameId());
    kit.manager.voteNextGame("guest", guestChoice);

    assertEquals(RoomPhase.NEXT_GAME_VOTE_RESULTS, room.phase);
    assertEquals(Map.of(hostChoice, 1, guestChoice, 1, room.nextGameVote.optionGameIds.get(2), 0),
        room.nextGameVote.tallies);
    assertTrue(List.of(hostChoice, guestChoice).contains(room.nextGameVote.resolvedGameId));
    assertEquals(kit.time.now() + 3_000, room.nextGameVote.nextTransitionAt);

    var winner = room.nextGameVote.resolvedGameId;
    kit.time.advance(3_005);
    assertNotEquals(RoomPhase.LOBBY, room.phase);
    assertEquals(winner, room.game.gameId);
    assertNull(room.nextGameVote);
  }

  @Test
  @DisplayName("resolves the next-game vote after 15 seconds even when players abstain")
  void resolvesAbstainedVote() {
    var kit = new RoomTestKit(80_000, UserGameConfigPreferences.NO_OP, "shiny-vote", "pokemon-bingo");
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    room.gameSelectionMode = new GameSelectionMode.Vote(List.of("higher-lower", "shiny-vote", "pokemon-bingo"));
    kit.manager.beginNextGameVote(room);
    kit.manager.schedule(room);
    kit.time.advance(15_004);
    assertEquals(RoomPhase.NEXT_GAME_VOTE, room.phase);
    kit.time.advance(1);
    assertEquals(RoomPhase.NEXT_GAME_VOTE_RESULTS, room.phase);
    assertNotNull(room.nextGameVote.resolvedGameId);
    assertEquals(List.of(0, 0, 0), List.copyOf(room.nextGameVote.tallies.values()));
    assertMessage("No hay una votación de minijuegos activa.", () -> kit.manager.voteNextGame("host", "higher-lower"));
  }

  @Test
  @DisplayName("breaks a next-game vote tie with the injected random source")
  void breaksVoteTieRandomly() {
    var winners = new java.util.HashSet<String>();
    for (long seed = 1; seed <= 12; seed++) {
      var kit = new RoomTestKit("shiny-vote", "pokemon-bingo");
      var random = new SeededRandom(seed);
      var manager = new RoomCoordinator(kit.registry, RoomTestKit.MAPPER, kit.events, kit.audit, kit.persister,
          UserGameConfigPreferences.NO_OP, HostContentProvider.EMPTY, kit.time, random, kit.time, RoomSettings.DEFAULTS,
          () -> GameCatalogs.of(RoomTestKit.CATALOG), RoomTestKit.ASSETS);
      var room = manager.store.get(manager.create(guest("host", "Host"), "h", null).code());
      manager.join(guest("guest", "Ana"), "g", room.code);
      room.gameSelectionMode = new GameSelectionMode.Vote(List.of("higher-lower", "shiny-vote", "pokemon-bingo"));
      manager.beginNextGameVote(room);
      var options = room.nextGameVote.optionGameIds;
      manager.voteNextGame("host", options.get(0));
      manager.voteNextGame("guest", options.get(1));
      assertTrue(Set.of(options.get(0), options.get(1)).contains(room.nextGameVote.resolvedGameId));
      winners.add(room.nextGameVote.resolvedGameId.equals(options.get(0)) ? "first" : "second");
    }
    assertEquals(Set.of("first", "second"), winners);
  }

  // ------------------------------------------------------------------------------- juegos sin motor y vistas

  @Test
  @DisplayName("rejects games without a Java engine while keeping their registry defaults")
  void rejectsUnportedGames() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    var shinyDefault = RoomTestKit.tree(RoomTestKit.REAL_REGISTRY.get("shiny-vote").orElseThrow().defaultConfig());
    assertTrue(JsonTree.equal(shinyDefault, room.gameConfigs.get("shiny-vote")));
    assertMessage(RoomCoordinator.NOT_PORTED, () -> kit.manager.updateGameConfig("host", "shiny-vote", shinyDefault));
    assertMessage("Minijuego desconocido.", () -> kit.manager.updateGameConfig("host", "missing", shinyDefault));
    assertMessage(RoomCoordinator.NOT_PORTED, () -> kit.manager.updateGameSelection("host",
        json("{\"type\":\"RANDOM\",\"gameIds\":[\"higher-lower\",\"shiny-vote\"]}")));
    kit.manager.selectGame("host", "shiny-vote");
    kit.manager.setReady("guest", true);
    assertMessage(RoomCoordinator.NOT_PORTED, () -> kit.manager.startGame("host"));
    kit.manager.selectGame("host", "higher-lower");
    room.gameSelectionMode = new GameSelectionMode.Random(List.of("higher-lower", "shiny-vote"));
    assertMessage(RoomCoordinator.NOT_PORTED, () -> kit.manager.startGame("host"));
    room.gameSelectionMode = new GameSelectionMode.Fixed();
    assertEquals(RoomPhase.LOBBY, room.phase);
    assertEquals(List.of("higher-lower"), kit.manager.playableGameIds(room, List.of("higher-lower", "tcg-higher-lower")));
    assertEquals(Set.of(), Set.copyOf(kit.manager.view(room, "host").customizedGameIds()));
  }

  @Test
  @DisplayName("edits and publishes a rotation game without changing the selected minigame")
  void editsRotationGameConfig() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"));
    var nextConfig = new LinkedHashMap<>(RoomTestKit.asMap(room.gameConfigs.get("higher-lower")));
    nextConfig.put("rounds", 7);
    kit.manager.updateGameConfig("host", "higher-lower", RoomTestKit.tree(nextConfig));
    assertEquals("pokedex-distance", room.selectedGameId);
    var view = kit.manager.view(room, "host");
    assertEquals("pokedex-distance", view.selectedGameId());
    assertEquals(7, view.gameConfigs().get("higher-lower").get("rounds").getIntValue());
    assertEquals(List.of("higher-lower"), view.customizedGameIds());
    assertEquals(28, view.gameConfigs().size());

    nextConfig.put("rounds", 10);
    kit.manager.updateGameConfig("host", "higher-lower", RoomTestKit.tree(nextConfig));
    assertEquals(List.of(), kit.manager.view(room, "host").customizedGameIds());
  }

  @Test
  @DisplayName("loads each registered host preference into new rooms and saves edited games separately")
  void loadsAndSavesUserPreferences() {
    var saved = new ArrayList<String>();
    var loaded = new ArrayList<String>();
    var preferences = new UserGameConfigPreferences() {
      @Override
      public Map<String, JsonNode> forUser(String userId) {
        loaded.add(userId);
        return Map.of("pokedex-distance", json("{\"generations\":[1],\"roundSeconds\":25,\"selectionVisibility\":\"HIDDEN\"}"));
      }

      @Override
      public void save(String userId, String gameId, JsonNode config) {
        saved.add(userId + ":" + gameId + ":" + config.get("rounds").getIntValue());
      }
    };
    var kit = new RoomTestKit(50_000, preferences);
    var room = kit.room(8, user("host-user", "Host", "host@example.com"));
    assertEquals(List.of("host-user"), loaded);
    assertTrue(JsonTree.equal(json("{\"generations\":[1],\"roundSeconds\":25,\"selectionVisibility\":\"HIDDEN\"}"), room.gameConfigs.get("pokedex-distance")));
    kit.manager.selectGame("host-user", "higher-lower");
    var next = new LinkedHashMap<>(RoomTestKit.asMap(room.gameConfigs.get("higher-lower")));
    next.put("rounds", 3);
    kit.manager.updateConfig("host-user", RoomTestKit.tree(next));
    assertEquals(List.of("host-user:higher-lower:3"), saved);

    var guestKit = new RoomTestKit(50_000, preferences);
    loaded.clear();
    saved.clear();
    var guestRoom = guestKit.room(8, guest("guest-host", "Guest Host"));
    guestKit.manager.updateConfig("guest-host", json("{\"generations\":[1],\"roundSeconds\":25,\"selectionVisibility\":\"HIDDEN\"}"));
    assertEquals(List.of(), loaded);
    assertEquals(List.of(), saved);
    assertTrue(JsonTree.equal(json("{\"generations\":[1],\"roundSeconds\":25,\"selectionVisibility\":\"HIDDEN\"}"), guestRoom.gameConfigs.get("pokedex-distance")));
  }

  @Test
  @DisplayName("publishes exactly the RoomView keys with a monotonic revision and stable room instance id")
  void roomViewShapeAndRevision() {
    var kit = new RoomTestKit();
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    var first = kit.events.lastStateFor("host");
    kit.manager.setReady("guest", true);
    var second = kit.events.lastStateFor("host");
    assertTrue(second.revision() > first.revision());
    assertEquals(room.historyId, second.roomInstanceId());
    assertEquals(first.roomInstanceId(), second.roomInstanceId());
    var keys = RoomTestKit.asMap(second).keySet();
    assertEquals(Set.of("code", "phase", "hostId", "maxPlayers", "members", "availableGames", "selectedGameId",
        "selectedGameConfig", "gameConfigs", "customizedGameIds", "sessionMode", "gameSelectionMode", "nextGameVote",
        "gameSkipState", "gamesPlayed", "sessionStandings", "sessionHistory", "roomInstanceId", "revision",
        "gameCatalogVersion", "gameActionEpoch", "game", "gamePlayerState", "serverNow", "hostCustomCategoryCount",
        "hostWouldYouRatherPromptCount"), keys);
    var serialized = serialize(second);
    assertTrue(serialized.contains("\"gameCatalogVersion\":null"));
    assertTrue(serialized.contains("\"game\":null"));
    assertTrue(serialized.contains("\"gameSkipState\":null"));
    assertTrue(serialized.contains("\"sessionMode\":{\"type\":\"INFINITE\"}"));
    assertTrue(serialized.contains("\"gameSelectionMode\":{\"type\":\"FIXED\"}"));
    assertTrue(serialized.contains("\"isHost\":true"));
    assertTrue(serialized.contains("\"avatar\":{\"type\":\"DEFAULT\"}"));
    assertEquals(Set.of("id", "displayName", "avatar", "connected", "presence", "roomRole", "role", "isHost", "ready",
        "sessionPoints"), RoomTestKit.asMap(second.members().getFirst()).keySet());
    assertFalse(RoomTestKit.asMap(second.availableGames().getFirst()).containsKey("defaultConfig"));

    kit.selectHigherLower("host");
    kit.startReady(room, "host");
    var playing = kit.events.lastStateFor("guest");
    assertEquals(room.game.resultId, playing.gameSkipState().gameInstanceId());
    assertNotNull(playing.gameCatalogVersion());
    assertEquals(room.game.engine.getLifecycle(room.game.state).actionEpoch(), playing.gameActionEpoch());
    assertNotNull(playing.gamePlayerState());
    assertEquals(kit.time.now(), playing.serverNow());
    long previous = -1;
    for (var sent : kit.events.named("room:state")) {
      if (!sent.memberId().equals("host")) continue;
      var revision = ((RoomView) sent.payload()).revision();
      assertTrue(revision > previous);
      previous = revision;
    }
  }

  @Test
  @DisplayName("builds one common public projection per broadcast and keeps private views per player")
  void oneProjectionPerBroadcast() {
    var publicCalls = new AtomicInteger();
    var privateCalls = new AtomicInteger();
    var engines = new LinkedHashMap<String, GameEngine<?, ?, ?, ?>>();
    engines.put("higher-lower", CountingEngine.wrap(RoomTestKit.REAL_REGISTRY.engine("higher-lower").orElseThrow(),
        publicCalls, privateCalls));
    var kit = new RoomTestKit(50_000, UserGameConfigPreferences.NO_OP, HostContentProvider.EMPTY,
        RoomTestKit.REAL_REGISTRY.withEngines(engines));
    var room = kit.room(8, guest("host", "Host"), guest("guest", "Ana"));
    kit.selectHigherLower("host");
    kit.startReady(room, "host");
    publicCalls.set(0);
    privateCalls.set(0);
    kit.manager.broadcast(room);
    assertEquals(1, publicCalls.get());
    assertEquals(2, privateCalls.get());
  }

  @Test
  @DisplayName("pins catalog resources for an active game and replaces them for the next launch")
  void pinsCatalogPerGame() {
    var fixture = activeSkipFixture(2, 10);
    var kit = fixture.kit();
    var room = fixture.room();
    var previous = room.game.catalog;
    var nextCatalog = new InMemoryPokemonCatalog(RoomTestKit.CATALOG.all());
    var nextAudio = new InMemoryPokemonAudioCatalog(List.of());
    kit.manager.replaceCatalog(new GameCatalogs(nextCatalog, null, nextAudio));
    assertSame(previous.pokemon(), kit.manager.context(room).pokemon());
    assertNull(kit.manager.context(room).pokemonAudio());
    assertEquals(previous.version(), room.game.catalog.version());
    kit.manager.launchGame(room);
    assertSame(nextCatalog, room.game.catalog.pokemon());
    assertSame(nextAudio, kit.manager.context(room).pokemonAudio());
    assertNotNull(kit.manager.context(room).preloadImage());
    assertNotEquals(previous.version(), room.game.catalog.version());
    kit.manager.stop();
    assertEquals(0, kit.time.activeTimers());
  }

  // ----------------------------------------------------------------------------- salto unánime de minijuego

  @Nested
  @DisplayName("global unanimous game skip")
  class GlobalUnanimousGameSkip {

    @Test
    @DisplayName("waits for the host when every other participant has voted")
    void waitsForHost() {
      var f = activeSkipFixture(4, 10);
      for (var person : f.people().subList(1, 4)) f.setVote(person.id(), true);
      assertEquals(f.instanceId(), f.room().game.resultId);
      assertEquals(3, f.room().game.skipVoterIds.size());
    }

    @Test
    @DisplayName("expires a missing voter using the existing grace timer and skips automatically")
    void expiresMissingVoter() {
      var f = activeSkipFixture(3, 10);
      var kit = f.kit();
      f.setVote("skip-p1", true);
      f.setVote("skip-p2", true);
      kit.manager.disconnect("skip-p3", "skip-socket-3");
      kit.time.advance(29_999);
      assertEquals(f.instanceId(), f.room().game.resultId);
      assertEquals(3, kit.manager.view(f.room(), "skip-p1").gameSkipState().requiredVotes());
      kit.time.advance(1);
      assertNotEquals(f.instanceId(), f.room().game.resultId);
      assertEquals(0, f.room().gamesPlayed);
      assertNull(kit.manager.store.roomForPlayer("skip-p3"));
    }

    @Test
    @DisplayName("removes a departed vote and never restores it when the identity rejoins as spectator")
    void departedVoteNeverRestored() {
      var f = activeSkipFixture(3, 10);
      var kit = f.kit();
      f.setVote("skip-p2", true);
      kit.manager.finalDisconnect(f.room(), "skip-p2", true);
      kit.manager.join(f.people().get(1), "skip-rejoined", f.room().code);
      var state = kit.manager.view(f.room(), "skip-p2").gameSkipState();
      assertEquals(0, state.votes());
      assertEquals(2, state.requiredVotes());
      assertFalse(state.currentUserVoted());
      assertFalse(state.canVote());
      assertEquals(MemberRole.SPECTATOR, f.room().members.get("skip-p2").role);
      assertMessage("No puedes votar para saltar este minijuego.", () -> f.setVote("skip-p2", true));
    }

    @Test
    @DisplayName("invalidates the old timer callback even when it was already queued")
    void invalidatesQueuedTimer() {
      var f = activeSkipFixture(2, 10);
      var kit = f.kit();
      var staleCallback = kit.time.lastScheduledTask();
      for (var person : f.people()) f.setVote(person.id(), true);
      var replacement = f.room().game;
      var nextState = replacement.state;
      kit.time.set(kit.time.now() + 60_000);
      staleCallback.run();
      assertSame(replacement, f.room().game);
      assertSame(nextState, replacement.state);
      assertEquals(0, f.room().gamesPlayed);
    }

    @Test
    @DisplayName("rejects stale gameplay and skip messages at the socket boundary")
    void rejectsStaleMessages() {
      var f = activeSkipFixture(1, 10);
      var kit = f.kit();
      kit.manager.withConnection("skip-p1", "skip-socket-1", () -> {
        f.setVote("skip-p1", true);
        return null;
      });
      var replacement = f.room().game;
      assertMessage("El minijuego ya ha cambiado.", () -> kit.manager.gameAction("skip-p1", json("{\"gameInstanceId\":\""
          + f.instanceId() + "\",\"actionEpoch\":\"stale\",\"action\":{\"type\":\"ANSWER\",\"choice\":\"HIGHER\"}}")));
      assertEquals(0, kit.publicGame(f.room(), "skip-p1").get("answers").size());
      assertMessage("El minijuego ya ha cambiado.", () -> f.setVote("skip-p1", false));
      assertEquals(0, replacement.skipVoterIds.size());
      var epoch = replacement.engine.getLifecycle(replacement.state).actionEpoch();
      kit.manager.gameAction("skip-p1", json("{\"gameInstanceId\":\"" + replacement.resultId + "\",\"actionEpoch\":"
          + JsonTree.quote(epoch) + ",\"action\":{\"type\":\"ANSWER\",\"choice\":\"HIGHER\"}}"));
    }

    @Test
    @DisplayName("discards current partial scores while preserving previous session results")
    void discardsPartialScores() {
      var f = activeSkipFixture(2, 10);
      var room = f.room();
      room.gamesPlayed = 1;
      var history = new SessionGameSummary(1, "shiny-vote", List.of("skip-p1"), null, Map.of("skip-p1", 7), null);
      room.sessionHistory.add(history);
      room.members.get("skip-p1").sessionPoints = 7;
      room.sessionParticipants.get("skip-p1").sessionPoints = 7;
      f.kit().manager.action("skip-p1", answer("HIGHER"));
      for (var person : f.people()) f.setVote(person.id(), true);
      assertEquals(1, room.gamesPlayed);
      assertEquals(List.of(history), room.sessionHistory);
      assertEquals(7, room.members.get("skip-p1").sessionPoints);
      assertEquals(7, room.sessionParticipants.get("skip-p1").sessionPoints);
    }

    @Test
    @DisplayName("keeps completed-game identities available to delayed persistence after continuation")
    void delayedPersistenceKeepsIdentities() {
      var f = activeSkipFixture(2, 1);
      var kit = f.kit();
      var room = f.room();
      var releaseAudit = new CompletableFuture<Void>();
      room.game.auditReady = releaseAudit;
      var completedId = room.game.resultId;
      kit.manager.action("skip-p1", answer("HIGHER"));
      kit.manager.finalDisconnect(room, "skip-p2", true);
      assertEquals(RoomPhase.ROUND_RESULTS, room.phase);
      kit.passDeadline(room);
      assertEquals(RoomPhase.GAME_RESULTS, room.phase);
      kit.manager.continueSession("skip-p1");
      assertFalse(room.members.containsKey("skip-p2"));
      assertEquals(0, kit.persister.calls.size());
      releaseAudit.complete(null);
      kit.manager.flush();
      assertEquals(1, kit.persister.calls.size());
      var persisted = kit.persister.calls.getFirst();
      assertEquals(completedId, persisted.resultId());
      assertEquals(f.people().get(1), persisted.room().members().get("skip-p2"));
    }

    @Test
    @DisplayName("uses the random fallback when only the current game remains compatible")
    void randomFallbackToCurrentGame() {
      var f = activeSkipFixture(3, 10);
      var kit = f.kit();
      var room = f.room();
      room.gameSelectionMode = new GameSelectionMode.Random(List.of("higher-lower", "pokedex-distance"));
      kit.manager.finalDisconnect(room, "skip-p3", true);
      kit.manager.finalDisconnect(room, "skip-p2", true);
      f.setVote("skip-p1", true);
      assertEquals("higher-lower", room.game.gameId);
      assertNotEquals(f.instanceId(), room.game.resultId);
    }

    @Test
    @DisplayName("never treats an empty eligible roster as unanimous")
    void emptyRosterNeverUnanimous() {
      var f = activeSkipFixture(1, 10);
      f.room().game.departedParticipantIds.add(f.room().hostId);
      assertFalse(f.kit().manager.resolveUnanimousGameSkip(f.room(), f.room().game));
      assertNull(f.room().game.finishReason);
    }

    @Test
    @DisplayName("adds one idempotent vote and publishes 1/N")
    void addsIdempotentVote() {
      var f = activeSkipFixture(3, 10);
      f.setVote("skip-p2", true);
      f.setVote("skip-p2", true);
      var state = f.kit().manager.view(f.room(), "skip-p2").gameSkipState();
      assertEquals(List.of("skip-p2"), state.voterIds());
      assertEquals(1, state.votes());
      assertEquals(3, state.requiredVotes());
      assertTrue(state.currentUserVoted());
      assertTrue(state.canVote());
      assertEquals(1, f.kit().events.lastStateFor("skip-p3").gameSkipState().votes());
    }

    @Test
    @DisplayName("removes a vote idempotently and publishes 0/N")
    void removesIdempotentVote() {
      var f = activeSkipFixture(3, 10);
      f.setVote("skip-p2", true);
      f.setVote("skip-p2", false);
      f.setVote("skip-p2", false);
      var state = f.kit().manager.view(f.room(), "skip-p2").gameSkipState();
      assertEquals(List.of(), state.voterIds());
      assertEquals(0, state.votes());
      assertEquals(3, state.requiredVotes());
      assertFalse(state.currentUserVoted());
    }

    @Test
    @DisplayName("keeps the game active with N-1 votes and counts the host as one ordinary voter")
    void keepsGameWithMissingVote() {
      var f = activeSkipFixture(3, 10);
      f.setVote("skip-p1", true);
      f.setVote("skip-p2", true);
      assertEquals(f.instanceId(), f.room().game.resultId);
      assertNull(f.room().game.finishReason);
      assertEquals(Set.of("skip-p1", "skip-p2"), f.room().game.skipVoterIds);
    }

    @Test
    @DisplayName("does not grant the host a unilateral skip")
    void noUnilateralHostSkip() {
      var f = activeSkipFixture(4, 10);
      f.setVote("skip-p1", true);
      assertEquals(f.instanceId(), f.room().game.resultId);
      assertEquals(1, f.room().game.skipVoterIds.size());
    }

    @Test
    @DisplayName("skips on unanimity without results, winners, points or completed-game statistics")
    void skipsWithoutResults() {
      var f = activeSkipFixture(3, 10);
      var kit = f.kit();
      var skipped = f.room().game;
      for (var person : f.people()) f.setVote(person.id(), true);
      assertEquals(GameFinishReason.SKIPPED, skipped.finishReason);
      assertFalse(skipped.resultsApplied);
      assertNotEquals(f.instanceId(), f.room().game.resultId);
      assertEquals(RoomPhase.ROUND_ACTIVE, f.room().phase);
      assertEquals(0, f.room().gamesPlayed);
      assertTrue(f.room().sessionHistory.isEmpty());
      assertEquals(0, f.room().sessionParticipants.get("skip-p1").sessionPoints);
      var state = kit.manager.view(f.room(), "skip-p1").gameSkipState();
      assertEquals(0, state.votes());
      assertEquals(3, state.requiredVotes());
      kit.manager.flush();
      assertEquals(0, kit.persister.calls.size());
      assertEquals(f.instanceId(), kit.audit.abandoned.getFirst().resultId());
      assertEquals("SKIPPED", kit.audit.abandoned.getFirst().reason());
    }

    @Test
    @DisplayName("lets a one-player session skip with 1/1")
    void onePlayerSkip() {
      var f = activeSkipFixture(1, 10);
      f.setVote("skip-p1", true);
      assertNotEquals(f.instanceId(), f.room().game.resultId);
      assertEquals(0, f.room().gamesPlayed);
    }

    @Test
    @DisplayName("does not apply a delayed duplicate vote to the next game instance")
    void delayedDuplicateVote() {
      var f = activeSkipFixture(1, 10);
      f.setVote("skip-p1", true);
      assertMessage("El minijuego ya ha cambiado.", () -> f.setVote("skip-p1", true, f.instanceId()));
      assertEquals(0, f.room().game.skipVoterIds.size());
    }

    @Test
    @DisplayName("keeps votes and required voters through the reconnect grace period")
    void keepsVotesThroughGrace() {
      var f = activeSkipFixture(2, 10);
      var kit = f.kit();
      f.setVote("skip-p1", true);
      kit.manager.disconnect("skip-p1", "skip-socket-1");
      assertNull(f.room().game.finishReason);
      var state = kit.manager.view(f.room(), "skip-p2").gameSkipState();
      assertEquals(1, state.votes());
      assertEquals(2, state.requiredVotes());
      kit.manager.connect(f.people().getFirst(), "skip-restored");
      var restored = (RoomView) kit.events.named("session:restored").getLast().payload();
      assertEquals(1, restored.gameSkipState().votes());
      assertEquals(2, restored.gameSkipState().requiredVotes());
      assertTrue(restored.gameSkipState().currentUserVoted());
    }

    @Test
    @DisplayName("recalculates required votes after a definitive departure")
    void recalculatesAfterDeparture() {
      var f = activeSkipFixture(4, 10);
      f.setVote("skip-p1", true);
      f.setVote("skip-p2", true);
      f.kit().manager.finalDisconnect(f.room(), "skip-p4", true);
      assertEquals(f.instanceId(), f.room().game.resultId);
      var state = f.kit().manager.view(f.room(), "skip-p1").gameSkipState();
      assertEquals(2, state.votes());
      assertEquals(3, state.requiredVotes());
    }

    @Test
    @DisplayName("skips automatically when a definitive departure creates unanimity")
    void departureCreatesUnanimity() {
      var f = activeSkipFixture(4, 10);
      for (var person : f.people().subList(0, 3)) f.setVote(person.id(), true);
      f.kit().manager.finalDisconnect(f.room(), "skip-p4", true);
      assertNotEquals(f.instanceId(), f.room().game.resultId);
      assertEquals(0, f.room().gamesPlayed);
    }

    @Test
    @DisplayName("keeps eliminated participants eligible without admitting mid-game spectators")
    void eliminatedStayEligible() {
      var f = activeSkipFixture(2, 10);
      var kit = f.kit();
      f.room().members.get("skip-p2").role = MemberRole.SPECTATOR;
      assertTrue(kit.manager.view(f.room(), "skip-p2").gameSkipState().canVote());
      f.setVote("skip-p2", true);
      kit.manager.join(guest("skip-watcher", "Watcher"), "skip-watcher-socket", f.room().code);
      var watcher = kit.manager.view(f.room(), "skip-watcher").gameSkipState();
      assertEquals(2, watcher.requiredVotes());
      assertFalse(watcher.currentUserVoted());
      assertFalse(watcher.canVote());
      assertMessage("No puedes votar para saltar este minijuego.", () -> f.setVote("skip-watcher", true));
    }

    @Test
    @DisplayName("rejects an external identity and never accepts a client-supplied voter id")
    void rejectsExternalIdentity() {
      var f = activeSkipFixture(2, 10);
      assertMessage("Not in a room", () -> f.kit().manager.setGameSkipVote("outside",
          json("{\"gameInstanceId\":\"" + f.instanceId() + "\",\"wantsToSkip\":true}")));
      var error = rejects(() -> f.kit().manager.setGameSkipVote("skip-p1",
          json("{\"gameInstanceId\":\"" + f.instanceId() + "\",\"wantsToSkip\":true,\"playerId\":\"skip-p2\"}")));
      assertTrue(error.getMessage().contains("\"code\": \"unrecognized_keys\""), error.getMessage());
      assertTrue(error.getMessage().contains("Unrecognized key: \\\"playerId\\\""), error.getMessage());
      assertEquals(Set.of(), f.room().game.skipVoterIds);
    }

    @Test
    @DisplayName("preserves votes across internal round transitions")
    void preservesVotesAcrossRounds() {
      var f = activeSkipFixture(2, 2);
      var kit = f.kit();
      f.setVote("skip-p1", true);
      kit.manager.action("skip-p1", answer("HIGHER"));
      kit.manager.action("skip-p2", answer("LOWER"));
      assertEquals(RoomPhase.ROUND_RESULTS, f.room().phase);
      kit.passDeadline(f.room());
      assertEquals(f.instanceId(), f.room().game.resultId);
      assertEquals(2, kit.publicGame(f.room(), "skip-p1").get("roundNumber").getIntValue());
      assertEquals(Set.of("skip-p1"), f.room().game.skipVoterIds);
    }

    @Test
    @DisplayName("lets normal completion win the critical section before a late final vote")
    void normalCompletionWins() {
      var f = activeSkipFixture(2, 1);
      var kit = f.kit();
      f.setVote("skip-p1", true);
      kit.manager.action("skip-p1", answer("HIGHER"));
      kit.manager.action("skip-p2", answer("LOWER"));
      kit.passDeadline(f.room());
      assertEquals(GameFinishReason.COMPLETED, f.room().game.finishReason);
      assertMessage("No hay un minijuego activo que se pueda saltar.", () -> f.setVote("skip-p2", true));
      assertEquals(1, f.room().gamesPlayed);
      kit.manager.flush();
      assertEquals(1, kit.persister.calls.size());
    }

    @Test
    @DisplayName("ignores a stale normal finish after the final skip vote claims the instance")
    void ignoresStaleNormalFinish() {
      var f = activeSkipFixture(2, 1);
      var kit = f.kit();
      var skipped = f.room().game;
      f.setVote("skip-p1", true);
      f.setVote("skip-p2", true);
      var replacementId = f.room().game.resultId;
      kit.manager.syncAndBroadcast(f.room(), skipped);
      assertEquals(GameFinishReason.SKIPPED, skipped.finishReason);
      assertEquals(replacementId, f.room().game.resultId);
      assertEquals(0, f.room().gamesPlayed);
      kit.manager.flush();
      assertEquals(0, kit.persister.calls.size());
    }

    @Test
    @DisplayName("uses random progression while excluding the skipped game when an alternative exists")
    void randomProgressionExcludesSkipped() {
      var f = activeSkipFixture(2, 10);
      f.room().gameSelectionMode = new GameSelectionMode.Random(List.of("higher-lower", "pokedex-distance"));
      for (var person : f.people()) f.setVote(person.id(), true);
      assertEquals("pokedex-distance", f.room().selectedGameId);
      assertEquals("pokedex-distance", f.room().game.gameId);
      assertNotEquals(f.instanceId(), f.room().game.resultId);
    }

    @Test
    @DisplayName("uses the configured next-game vote flow without exposing normal game results")
    void voteFlowAfterSkip() {
      var f = activeSkipFixture(2, 10, "shiny-vote", "pokemon-bingo");
      f.room().gameSelectionMode = new GameSelectionMode.Vote(List.of("higher-lower", "shiny-vote", "pokemon-bingo"));
      for (var person : f.people()) f.setVote(person.id(), true);
      assertEquals(RoomPhase.NEXT_GAME_VOTE, f.room().phase);
      assertNull(f.room().game);
      assertEquals(3, f.room().nextGameVote.optionGameIds.size());
      assertNull(f.kit().manager.view(f.room(), "skip-p1").gameSkipState());
      assertTrue(f.room().sessionHistory.isEmpty());
    }
  }

  // ------------------------------------------------------------------------------------------ cierre

  @Test
  @DisplayName("stops timers and refuses new connections while shutting down")
  void stopsTimersOnShutdown() {
    var fixture = activeSkipFixture(2, 10);
    var kit = fixture.kit();
    kit.manager.disconnect("skip-p2", "skip-socket-2");
    // Plazo de la ronda, gracia de reconexión y gracia de presencia de higher-lower.
    assertEquals(3, kit.time.activeTimers());
    kit.manager.stop();
    assertEquals(0, kit.time.activeTimers());
    assertFalse(kit.manager.connect(fixture.people().get(1), "late"));
    assertMessage("El servidor se está cerrando", kit.manager::assertAcceptingCommands);
    var phase = fixture.room().phase;
    kit.time.advance(120_000);
    assertEquals(phase, fixture.room().phase);
    kit.manager.flush();
  }

  /** Comprueba que el temporizador real de producción dispara y se cancela. */
  @Test
  @DisplayName("production scheduler fires on a virtual thread and honours cancellation")
  void productionScheduler() throws Exception {
    var schedulers = new ExecutorRoomSchedulers();
    try {
      var fired = new CompletableFuture<Boolean>();
      schedulers.schedule(10, () -> fired.complete(Thread.currentThread().isVirtual()));
      assertTrue(fired.get(2, TimeUnit.SECONDS));
      var cancelled = new CompletableFuture<Boolean>();
      var cancel = schedulers.schedule(200, () -> cancelled.complete(true));
      cancel.run();
      Thread.sleep(400);
      assertFalse(cancelled.isDone());
    } finally {
      schedulers.shutdown();
    }
  }
}

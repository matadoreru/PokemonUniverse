package es.pokemonuniverse.domain.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** {@code rooms/presence.test.ts}. */
class PresenceTest {

  private static RoomMember member(String id, long joinedAt) {
    return new RoomMember(new AuthUser(id, id, AuthUser.Kind.GUEST, null, null, new AvatarRef.Default()), id,
        MemberRole.PLAYER, RoomRole.MEMBER, joinedAt);
  }

  private static LiveRoom room(RoomMember... members) {
    var room = new LiveRoom("history", "PIKA42", members[0].identity.id(), 8, "higher-lower", Map.of(), 0);
    for (var member : members) room.members.put(member.identity.id(), member);
    return room;
  }

  @Test
  @DisplayName("applies the shared reconnect and departure state transitions")
  void transitions() {
    var current = member("player", 1);
    var cancelled = new boolean[1];
    var timer = new RoomTimer();
    timer.bind(() -> cancelled[0] = true);
    current.disconnectTimer = timer;
    var renamed = new AuthUser("player", "restored", AuthUser.Kind.GUEST, null, null, new AvatarRef.Default());
    Presence.restoreMember(current, renamed, "new-socket");
    assertTrue(cancelled[0]);
    assertTrue(current.connected);
    assertEquals(PresenceStatus.CONNECTED, current.presence);
    assertEquals("new-socket", current.connectionId);
    assertNull(current.disconnectTimer);
    assertEquals("restored", current.identity.displayName());
    Presence.markTemporarilyDisconnected(current);
    assertFalse(current.connected);
    assertEquals(PresenceStatus.TEMPORARILY_DISCONNECTED, current.presence);
    assertNull(current.connectionId);
    Presence.markLeft(current);
    assertFalse(current.connected);
    assertEquals(PresenceStatus.LEFT, current.presence);
    assertNull(current.connectionId);
  }

  @Test
  @DisplayName("selects the oldest connected host candidate")
  void oldestConnected() {
    var late = member("late", 20);
    var early = member("early", 10);
    var offline = member("offline", 1);
    Presence.markTemporarilyDisconnected(offline);
    assertEquals("early", Presence.oldestConnectedMember(room(late, offline, early)).orElseThrow().identity.id());
  }

  @Test
  @DisplayName("uses the stable runtime roster without inspecting private game state")
  void stableRoster() {
    var room = room(member("player", 1));
    room.phase = RoomPhase.ROUND_ACTIVE;
    room.game = new GameRuntime(new GameCatalogSnapshot("v", null), "result", "higher-lower", List.of("player"), null,
        null, null, Map.of("secret", "opaque"), 0, CompletableFuture.completedFuture(null));
    assertTrue(Presence.gameRetainsPlayer(room, "player"));
    assertFalse(Presence.gameRetainsPlayer(room, "spectator"));
    room.phase = RoomPhase.GAME_RESULTS;
    assertFalse(Presence.gameRetainsPlayer(room, "player"));
  }

  @Test
  @DisplayName("formats pending ready names like formatPendingReadyNames")
  void formatsPendingNames() {
    assertEquals("Ana", RoomTexts.formatPendingReadyNames(List.of("Ana")));
    assertEquals("Ana, Bea, Carla", RoomTexts.formatPendingReadyNames(List.of("Ana", "Bea", "Carla")));
    assertEquals("Ana, Bea, Carla y 1 más", RoomTexts.formatPendingReadyNames(List.of("Ana", "Bea", "Carla", "Dani")));
  }

  @Test
  @DisplayName("checks the role permission table of room.ts")
  void permissionTable() {
    for (var permission : RoomPermission.values()) assertTrue(RoomPermission.has(RoomRole.HOST, permission));
    assertTrue(RoomPermission.has(RoomRole.CO_HOST, RoomPermission.EDIT_GAME_SELECTION));
    assertFalse(RoomPermission.has(RoomRole.CO_HOST, RoomPermission.START_GAME));
    assertFalse(RoomPermission.has(RoomRole.MEMBER, RoomPermission.CHANGE_GAME));
  }

  @Test
  @DisplayName("generates six-character codes from the unambiguous alphabet")
  void roomCodes() {
    var code = RoomCodes.generate(bound -> bound - 1);
    assertEquals("999999", code);
    assertEquals("AAAAAA", RoomCodes.generate(bound -> 0));
  }

  @Test
  @DisplayName("evaluates isSessionComplete for each session mode")
  void sessionComplete() {
    assertFalse(SessionMode.isComplete(new SessionMode.Infinite(), 1_000, List.of(1_000)));
    assertTrue(SessionMode.isComplete(new SessionMode.GameCount(2), 2, List.of()));
    assertFalse(SessionMode.isComplete(new SessionMode.GameCount(2), 1, List.of()));
    assertTrue(SessionMode.isComplete(new SessionMode.PointTarget(5), 0, List.of(1, 5)));
    assertFalse(SessionMode.isComplete(new SessionMode.PointTarget(5), 0, List.of(4)));
  }
}

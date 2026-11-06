package es.pokemonuniverse.application.friends;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.friends.FriendPresenceTest.FakeConnections;
import es.pokemonuniverse.application.friends.FriendPresenceTest.Sent;
import es.pokemonuniverse.application.friends.RoomInvitations.InvitePayload;
import es.pokemonuniverse.application.rooms.RoomException;
import es.pokemonuniverse.application.rooms.RoomSummary;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/** Reglas y límites de {@code room:invite} con amistades, salas, conexiones y reloj falsos. */
class RoomInvitationsTest {

  private static final AuthUser HOST = new AuthUser("host", "Ash", AuthUser.Kind.USER, "ash@mail.com", null,
      new AvatarRef.Custom("pikachu", 3));

  /** Conexiones con varias pestañas: cada envío llega una vez por pestaña abierta. */
  private final FakeConnections connections = new FakeConnections();
  private final Map<String, Integer> tabs = new HashMap<>();
  private final UserConnections multiTab = new UserConnections() {
    @Override
    public boolean isOnline(String userId) {
      return connections.isOnline(userId);
    }

    @Override
    public void send(String userId, String event, Object payload) {
      for (int i = 0; i < tabs.getOrDefault(userId, 1); i++) connections.send(userId, event, payload);
    }
  };
  private final Set<String> friendsOfHost = new HashSet<>();
  private final Map<String, RoomSummary> rooms = new HashMap<>();
  private long now = 1_000_000;
  private final AtomicInteger ids = new AtomicInteger();
  private final RoomInvitations invitations = new RoomInvitations(multiTab,
      (a, b) -> a.equals("host") && friendsOfHost.contains(b),
      id -> Optional.ofNullable(rooms.get(id)), () -> now, () -> "invite-" + ids.incrementAndGet());

  private void hostInRoom(Set<String> members, int maxPlayers) {
    rooms.put("host", new RoomSummary("PIKA42", members, members, maxPlayers, "Higher or Lower", true));
  }

  private void friend(String id) {
    friendsOfHost.add(id);
    connections.online.add(id);
  }

  private static void assertRejects(String message, Runnable operation) {
    assertEquals(message, assertThrows(RoomException.class, operation::run).getMessage());
  }

  private List<Sent> invitesTo(String userId) {
    return connections.sent.stream().filter(s -> s.userId().equals(userId) && s.event().equals("friends:invite"))
        .toList();
  }

  @Test
  void invitesConnectedFriendOnAllTabs() {
    hostInRoom(Set.of("host"), 4);
    friend("misty");
    tabs.put("misty", 2);

    invitations.invite(HOST, "misty");

    var sent = invitesTo("misty");
    assertEquals(2, sent.size());
    var payload = (InvitePayload) sent.getFirst().payload();
    assertEquals(new InvitePayload("invite-1", new InvitePayload.From("host", "Ash", new AvatarRef.Custom("pikachu", 3)),
        "PIKA42", "Higher or Lower", "1970-01-01T00:26:40.000Z"), payload);
    assertEquals(payload, sent.get(1).payload());
  }

  @Test
  void rejectsWhenHostIsNotInARoom() {
    friend("misty");
    assertRejects("You are not in a room", () -> invitations.invite(HOST, "misty"));
  }

  @Test
  void rejectsStrangersSelfAndMissingUser() {
    hostInRoom(Set.of("host"), 4);
    connections.online.add("stranger");
    assertRejects("Not a friend", () -> invitations.invite(HOST, "stranger"));
    assertRejects("Not a friend", () -> invitations.invite(HOST, "host"));
    assertRejects("Not a friend", () -> invitations.invite(HOST, null));
    assertTrue(connections.sent.isEmpty());
  }

  @Test
  void offlineAtInviteTimeSendsNothing() {
    hostInRoom(Set.of("host"), 4);
    friendsOfHost.add("misty");
    assertRejects("Friend is offline", () -> invitations.invite(HOST, "misty"));
    assertTrue(connections.sent.isEmpty());
    // No gasta el límite de la pareja: al conectarse, la invitación sale.
    connections.online.add("misty");
    invitations.invite(HOST, "misty");
    assertEquals(1, invitesTo("misty").size());
  }

  @Test
  void rejectsFriendAlreadyInTheRoom() {
    hostInRoom(Set.of("host", "misty"), 4);
    friend("misty");
    assertRejects("Already in this room", () -> invitations.invite(HOST, "misty"));
  }

  @Test
  void rejectsWhileTheRoomIsNotInTheLobby() {
    rooms.put("host", new RoomSummary("PIKA42", Set.of("host"), Set.of("host"), 4, "Higher or Lower", false));
    friend("misty");
    assertRejects("Invitations are only available in the lobby", () -> invitations.invite(HOST, "misty"));
    assertTrue(connections.sent.isEmpty());
  }

  @Test
  void rejectsFullRoom() {
    hostInRoom(Set.of("host", "brock"), 2);
    friend("misty");
    assertRejects("Room is full", () -> invitations.invite(HOST, "misty"));
  }

  @Test
  void seatOfAFriendWhoLeftMidGameIsNotFullNorAlreadyIn() {
    // Misty salió durante la partida: conserva su plaza (puede volver aunque la sala esté llena) pero ya no está.
    rooms.put("host", new RoomSummary("PIKA42", Set.of("host"), Set.of("host", "misty"), 2, null, true));
    friend("misty");
    invitations.invite(HOST, "misty");
    assertEquals(1, invitesTo("misty").size());
    assertEquals(null, ((InvitePayload) invitesTo("misty").getFirst().payload()).gameName());
  }

  @Test
  void secondInviteWithin30sRejectedAfter30sAllowed() {
    hostInRoom(Set.of("host"), 4);
    friend("misty");
    friend("brock");
    invitations.invite(HOST, "misty");
    now += 29_999;
    assertRejects("Invitation already sent", () -> invitations.invite(HOST, "misty"));
    invitations.invite(HOST, "brock"); // la pareja es por amigo
    now += 1;
    invitations.invite(HOST, "misty");
    assertEquals(2, invitesTo("misty").size());
  }

  @Test
  void tenPerMinutePerHost() {
    hostInRoom(Set.of("host"), 100);
    for (int i = 0; i < 11; i++) friend("f" + i);
    for (int i = 0; i < 10; i++) invitations.invite(HOST, "f" + i);
    assertRejects("Too many invitations", () -> invitations.invite(HOST, "f10"));
    assertTrue(invitesTo("f10").isEmpty());
    now += 60_000;
    invitations.invite(HOST, "f10");
    assertEquals(1, invitesTo("f10").size());
  }

  @Test
  void expiredLimitsAreForgotten() {
    hostInRoom(Set.of("host"), 4);
    friend("misty");
    invitations.invite(HOST, "misty");
    assertEquals(1, invitations.trackedPairs());
    assertEquals(1, invitations.trackedHosts());
    now += 60_000;
    friend("brock");
    invitations.invite(HOST, "brock");
    // La pareja host→misty y la ventana anterior del host ya caducaron: solo queda lo de esta invitación.
    assertEquals(1, invitations.trackedPairs());
    assertEquals(1, invitations.trackedHosts());
  }
}

package es.pokemonuniverse.application.friends;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.rooms.RoomOccupancy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Cálculo y avisos de presencia con conexiones y salas falsas y un ejecutor síncrono. */
class FriendPresenceTest {

  record Sent(String userId, String event, Object payload) {}

  /** Conexiones abiertas por usuario y lo enviado a cada uno. */
  static final class FakeConnections implements UserConnections {
    final Set<String> online = new HashSet<>();
    final List<Sent> sent = Collections.synchronizedList(new ArrayList<>());

    @Override
    public boolean isOnline(String userId) {
      return online.contains(userId);
    }

    @Override
    public void send(String userId, String event, Object payload) {
      if (online.contains(userId)) sent.add(new Sent(userId, event, payload));
    }
  }

  private final FakeConnections connections = new FakeConnections();
  private final Map<String, RoomOccupancy> rooms = new HashMap<>();
  private final Map<String, List<String>> friends = new HashMap<>();
  private final FriendPresence presence = new FriendPresence(connections,
      id -> friends.getOrDefault(id, List.of()), id -> rooms.getOrDefault(id, RoomOccupancy.NONE), Runnable::run);

  private List<Sent> presenceSentTo(String userId) {
    return connections.sent.stream().filter(s -> s.userId().equals(userId) && s.event().equals("friends:presence"))
        .toList();
  }

  private static Sent presence(String to, String userId, FriendStatus status) {
    return new Sent(to, "friends:presence", new FriendPresence.PresencePayload(userId, status));
  }

  @Test
  void statusFollowsConnectionsAndRooms() {
    assertEquals(FriendStatus.OFFLINE, presence.statusOf("a"));
    connections.online.add("a");
    assertEquals(FriendStatus.ONLINE, presence.statusOf("a"));
    rooms.put("a", RoomOccupancy.IN_ROOM);
    assertEquals(FriendStatus.IN_ROOM, presence.statusOf("a"));
    rooms.put("a", RoomOccupancy.PLAYING);
    assertEquals(FriendStatus.PLAYING, presence.statusOf("a"));
    rooms.put("a", RoomOccupancy.IN_ROOM);
    assertEquals(FriendStatus.IN_ROOM, presence.statusOf("a"));
    rooms.remove("a");
    assertEquals(FriendStatus.ONLINE, presence.statusOf("a"));
    connections.online.remove("a");
    assertEquals(FriendStatus.OFFLINE, presence.statusOf("a"));
  }

  @Test
  void pushesOnlyOnChangeAndOnlyToConnectedFriends() {
    friends.put("a", List.of("friend", "offlineFriend"));
    connections.online.add("friend");
    connections.online.add("stranger");

    connections.online.add("a");
    presence.connectionOpened("a");
    assertEquals(List.of(presence("friend", "a", FriendStatus.ONLINE)), connections.sent);

    // Segunda pestaña y estados repetidos: sin cambio, sin aviso.
    presence.connectionOpened("a");
    presence.changed(List.of("a"));
    assertEquals(1, connections.sent.size());

    rooms.put("a", RoomOccupancy.IN_ROOM);
    presence.changed(List.of("a"));
    presence.changed(List.of("a"));
    rooms.put("a", RoomOccupancy.PLAYING);
    presence.changed(List.of("a"));
    rooms.remove("a");
    connections.online.remove("a");
    presence.connectionClosed("a");

    assertEquals(List.of(presence("friend", "a", FriendStatus.ONLINE), presence("friend", "a", FriendStatus.IN_ROOM),
        presence("friend", "a", FriendStatus.PLAYING), presence("friend", "a", FriendStatus.OFFLINE)),
        presenceSentTo("friend"));
    assertTrue(presenceSentTo("stranger").isEmpty());
    assertTrue(presenceSentTo("offlineFriend").isEmpty());
    assertEquals(0, presence.trackedUsers(), "una cuenta desconectada no ocupa la caché");
  }

  @Test
  void friendshipChangeNotifiesBoth() {
    connections.online.add("a");
    connections.online.add("b");
    connections.online.add("c");
    presence.changed("a", "b");
    assertEquals(List.of(new Sent("a", "friends:changed", Map.of()), new Sent("b", "friends:changed", Map.of())),
        connections.sent);
  }
}

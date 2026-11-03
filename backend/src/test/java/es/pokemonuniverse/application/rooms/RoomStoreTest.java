package es.pokemonuniverse.application.rooms;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.MemberRole;
import es.pokemonuniverse.domain.room.RoomMember;
import es.pokemonuniverse.domain.room.RoomRole;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** {@code rooms/store.test.ts}. */
class RoomStoreTest {

  private static LiveRoom room(String code, String... memberIds) {
    var room = new LiveRoom("h-" + code, code, memberIds.length > 0 ? memberIds[0] : "x", 8, "higher-lower", Map.of(), 0);
    for (var id : memberIds) {
      room.members.put(id, new RoomMember(new AuthUser(id, id, AuthUser.Kind.GUEST, null, null, new AvatarRef.Default()),
          id, MemberRole.PLAYER, RoomRole.MEMBER, 0));
    }
    return room;
  }

  @Test
  @DisplayName("restores the exact room state by stable authenticated identity")
  void restoresByIdentity() {
    var store = new RoomStore();
    var room = room("PIKA42");
    store.save(room);
    store.attachPlayer("user", room.code);
    assertSame(room, store.roomForPlayer("user"));
  }

  @Test
  @DisplayName("keeps the new association when an old room detaches or deletes its historical roster")
  void keepsNewAssociation() {
    var store = new RoomStore();
    var oldRoom = room("OLD", "user");
    var newRoom = room("NEW", "user");
    store.save(oldRoom);
    store.save(newRoom);
    store.attachPlayer("user", "NEW");
    store.detachPlayer("user", "OLD");
    assertSame(newRoom, store.roomForPlayer("user"));
    store.delete("OLD");
    assertSame(newRoom, store.roomForPlayer("user"));
    store.detachPlayer("user", "NEW");
    assertNull(store.roomForPlayer("user"));
  }

  @Test
  @DisplayName("attaches atomically unless the player belongs to another live room")
  void attachUnlessInOtherRoom() {
    var store = new RoomStore();
    store.save(room("AAA"));
    store.save(room("BBB"));
    assertTrue(store.attachUnlessInOtherRoom("user", "AAA"));
    assertTrue(store.attachUnlessInOtherRoom("user", "AAA"));
    assertFalse(store.attachUnlessInOtherRoom("user", "BBB"));
    store.delete("AAA");
    assertTrue(store.attachUnlessInOtherRoom("user", "BBB"));
    assertFalse(store.saveIfAbsent(room("BBB")));
  }

  /** {@code Map} de JavaScript: {@code list()} sigue el orden de creación, y re-guardar no mueve la sala. */
  @Test
  void listsRoomsInInsertionOrder() {
    var store = new RoomStore();
    var codes = List.of("ZZZZZZ", "AAAAAA", "MMMMMM", "BBBBBB", "YYYYYY", "CCCCCC", "XXXXXX", "DDDDDD");
    for (var code : codes) store.save(room(code));
    store.save(store.get("AAAAAA"));
    assertEquals(codes, store.list().stream().map(r -> r.code).toList());
    store.delete("MMMMMM");
    assertTrue(store.saveIfAbsent(room("MMMMMM")));
    assertEquals(List.of("ZZZZZZ", "AAAAAA", "BBBBBB", "YYYYYY", "CCCCCC", "XXXXXX", "DDDDDD", "MMMMMM"),
        store.list().stream().map(r -> r.code).toList());
  }
}

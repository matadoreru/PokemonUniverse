package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.guest;
import static es.pokemonuniverse.application.rooms.RoomTestKit.json;
import static es.pokemonuniverse.application.rooms.RoomTestKit.serialize;
import static es.pokemonuniverse.application.rooms.RoomTestKit.user;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.room.RoomPhase;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Nivel de las cuentas registradas en la vista de sala. */
class RoomExperienceTest {

  private static Integer level(RoomView view, String id) {
    return view.members().stream().filter(member -> member.id().equals(id)).findFirst().orElseThrow().level();
  }

  @Test
  @DisplayName("registered members show their level; guests show null")
  void levelInMemberView() {
    var reads = new ArrayList<String>();
    var kit = new RoomTestKit(RoomTestKit.Hooks.NONE.withExperience(id -> {
      reads.add(id);
      return Map.of("host-user", 260, "late-user", 0).get(id);
    }), "shiny-vote");
    var room = kit.room(8, user("host-user", "Host", "h@example.com"), guest("guest", "Ana"));
    var view = kit.manager.view(room, "guest");
    assertEquals(3, level(view, "host-user"));
    assertNull(level(view, "guest"));
    assertEquals(List.of("host-user"), reads); // los invitados no se consultan
    assertTrue(serialize(view).contains("\"level\":null"));
  }

  @Test
  @DisplayName("a finished game adds its experience in memory before persisting")
  void finishedGameRaisesLevel() {
    var kit = new RoomTestKit(RoomTestKit.Hooks.NONE.withExperience(id -> 80), "shiny-vote");
    var room = kit.room(8, user("host-user", "Host", "h@example.com"), guest("guest", "Ana"));
    kit.manager.selectGame("host-user", "shiny-vote");
    assertEquals(1, level(kit.manager.view(room, "host-user"), "host-user"));
    kit.startReady(room, "host-user");
    kit.manager.action("host-user", json("{\"type\":\"SCORE\",\"points\":3}"));
    kit.manager.action("host-user", json("{\"type\":\"FINISH\"}"));
    assertEquals(RoomPhase.GAME_RESULTS, room.phase);
    // 2 jugadores, primero: 20 + 30 = 50 → 130, nivel 2.
    assertEquals(130, room.members.get("host-user").xp);
    assertEquals(2, level(kit.manager.view(room, "host-user"), "host-user"));
    assertNull(room.members.get("guest").xp);
  }

  @Test
  @DisplayName("a failing experience read only leaves the member without level")
  void failingReadIsIgnored() {
    var kit = new RoomTestKit(RoomTestKit.Hooks.NONE.withExperience(id -> {
      throw new IllegalStateException("db down");
    }), "shiny-vote");
    var room = kit.room(8, user("host-user", "Host", "h@example.com"));
    assertNull(level(kit.manager.view(room, "host-user"), "host-user"));
  }
}

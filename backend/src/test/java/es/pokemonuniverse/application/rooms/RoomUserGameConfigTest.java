package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.guest;
import static es.pokemonuniverse.application.rooms.RoomTestKit.json;
import static es.pokemonuniverse.application.rooms.RoomTestKit.user;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.gameconfigs.StoredUserGameConfig;
import es.pokemonuniverse.application.gameconfigs.UserGameConfigService;
import es.pokemonuniverse.application.gameconfigs.UserGameConfigStore;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Salas con {@link UserGameConfigService} real ({@code manager.ts}): la lectura solo ocurre en {@code create()} para
 * una identidad USER; un invitado recibe los defectos; {@code room:update-game-config} de un USER co-host guarda en
 * las preferencias del propio co-host, no en las del host.
 */
class RoomUserGameConfigTest {

  private final List<String> writes = new ArrayList<>();
  private final ManualTime timers = new ManualTime(0);
  private final UserGameConfigService preferences = new UserGameConfigService(new UserGameConfigStore() {
    @Override
    public List<StoredUserGameConfig> list() {
      return List.of(new StoredUserGameConfig("host-user", "higher-lower", json("""
          {"generations":[2,1],"categories":["HP"],"showPreviousValue":false,"answerVisibility":"REVEAL",
           "difficulty":"HARD","roundSeconds":15,"rounds":3}""")));
    }

    @Override
    public void upsert(String userId, String gameId, JsonNode config) {
      writes.add(userId + ":" + gameId + ":" + config.get("rounds").getIntValue());
    }
  }, RoomTestKit.REAL_REGISTRY, timers, RoomTestKit.MAPPER, Runnable::run);

  @Test
  @DisplayName("a USER host gets its stored configs, a guest the defaults, and a co-host saves into its own")
  void storedPreferencesFollowTheIdentity() {
    preferences.load();
    writes.clear();
    var kit = new RoomTestKit(50_000, preferences);
    var room = kit.room(8, user("host-user", "Host", "host@example.com"), user("cohost-user", "Co", "co@example.com"));
    var stored = room.gameConfigs.get("higher-lower");
    assertEquals(3, stored.get("rounds").getIntValue());
    assertEquals("[1,2]", JsonTree.toCanonicalString(stored.get("generations")));

    var guestKit = new RoomTestKit(50_000, preferences);
    var guestRoom = guestKit.room(8, guest("guest-host", "Invitado"));
    assertEquals(10, guestRoom.gameConfigs.get("higher-lower").get("rounds").getIntValue());
    // Sin fila guardada, el host USER también recibe el defecto de ese juego.
    assertTrue(JsonTree.equal(guestRoom.gameConfigs.get("pokedex-distance"), room.gameConfigs.get("pokedex-distance")));

    kit.manager.setRoomRole("host-user", "cohost-user", JsonNode.createStringNode("CO_HOST"));
    var edited = new LinkedHashMap<>(RoomTestKit.asMap(stored));
    edited.put("rounds", 5);
    kit.manager.updateGameConfig("cohost-user", "higher-lower", RoomTestKit.tree(edited));
    assertEquals(5, room.gameConfigs.get("higher-lower").get("rounds").getIntValue());
    assertEquals(List.of(), writes);
    timers.advance(250);
    assertEquals(List.of("cohost-user:higher-lower:5"), writes);
    assertEquals(5, preferences.forUser("cohost-user").get("higher-lower").get("rounds").getIntValue());
    assertEquals(3, preferences.forUser("host-user").get("higher-lower").get("rounds").getIntValue());
  }
}

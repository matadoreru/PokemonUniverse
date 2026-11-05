package es.pokemonuniverse.adapters.in.ws;

import static es.pokemonuniverse.adapters.in.ws.WsTestClients.assertError;
import static es.pokemonuniverse.adapters.in.ws.WsTestClients.assertOk;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.FriendshipEntity;
import es.pokemonuniverse.adapters.out.persistence.FriendshipRepository;
import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.rooms.GameCatalogProvider;
import es.pokemonuniverse.application.rooms.GameCatalogs;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.golden.GoldenCatalogs;
import io.micronaut.context.annotation.Primary;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.websocket.WebSocketClient;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** {@code friends:presence} sobre {@code /ws} con cuentas reales y una amistad aceptada en Postgres. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "FriendsWebSocketTest")
class FriendsWebSocketTest {

  /** El catálogo de la base de datos de Test Resources está vacío: las partidas usan la fixture dorada. */
  @Singleton
  @Primary
  @Requires(property = "spec.name", value = "FriendsWebSocketTest")
  static class GoldenCatalogProvider implements GameCatalogProvider {
    @Override
    public GameCatalogs loadPokemonCatalog() {
      return GameCatalogs.of(GoldenCatalogs.load("gen1-2"));
    }
  }

  @Inject @Client("/") WebSocketClient client;
  @Inject IdentityTokens tokens;
  @Inject UserRepository users;
  @Inject FriendshipRepository friendships;

  private WsTestClients clients;
  private final List<String> created = new ArrayList<>();

  private record User(String id, String name) {}

  @BeforeEach
  void openClients() {
    clients = new WsTestClients(client, tokens);
  }

  @AfterEach
  void cleanUp() {
    clients.closeAll();
    created.forEach(id -> {
      if (users.existsById(id)) users.deleteById(id);
    });
    created.clear();
  }

  private User user() {
    var id = UUID.randomUUID().toString();
    var name = "fw_" + id.substring(0, 10);
    users.save(UserEntity.create(id, name, id + "@mail.com", "h", Instant.now().truncatedTo(ChronoUnit.MILLIS)));
    created.add(id);
    return new User(id, name);
  }

  private void friends(User a, User b) {
    var now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    var friendship = FriendshipEntity.create(UUID.randomUUID().toString(), a.id(), b.id(), now);
    friendship.accept(now);
    friendships.save(friendship);
  }

  private TestSocket connect(User user) {
    var identity = new AuthUser(user.id(), user.name(), AuthUser.Kind.USER, user.id() + "@mail.com", null,
        new AvatarRef.Default());
    return clients.connect(HttpRequest.GET("/ws")
        .cookie(Cookie.of("pu_session", tokens.sign(identity, Instant.now()))));
  }

  private static JsonNode awaitPresence(TestSocket socket, User of, String status) {
    return socket.awaitPush("friends:presence", payload -> of.id().equals(payload.get("userId").getStringValue())
        && status.equals(payload.get("status").getStringValue()));
  }

  /** Estados de {@code of} recibidos por {@code socket}, en orden. */
  private static List<String> presenceOf(TestSocket socket, User of) {
    return socket.received.stream()
        .filter(m -> m.get("ok") == null && "friends:presence".equals(m.get("event").getStringValue()))
        .map(m -> m.get("payload"))
        .filter(p -> of.id().equals(p.get("userId").getStringValue()))
        .map(p -> p.get("status").getStringValue())
        .toList();
  }

  @Test
  void friendSeesOnlineThenInRoom() {
    var a = user();
    var b = user();
    friends(a, b);
    var bSocket = connect(b);
    assertError("Not in a room", bSocket.command("room:leave", null));

    var aSocket = connect(a);
    awaitPresence(bSocket, a, "ONLINE");

    var code = aSocket.command("room:create", "{}").get("data").get("room").get("code").getStringValue();
    awaitPresence(bSocket, a, "IN_ROOM");

    assertOk(bSocket.command("room:join", "{\"code\":\"" + code + "\"}"));
    awaitPresence(aSocket, b, "IN_ROOM");
    assertOk(bSocket.command("room:set-ready", "{\"ready\":true}"));
    assertOk(aSocket.command("room:select-game", "{\"gameId\":\"higher-lower\"}"));
    assertOk(aSocket.command("room:start-game", null));
    awaitPresence(bSocket, a, "PLAYING");
    awaitPresence(aSocket, b, "PLAYING");

    assertEquals(List.of("ONLINE", "IN_ROOM", "PLAYING"), presenceOf(bSocket, a));
  }

  @Test
  void closingOneOfTwoTabsKeepsOnline() {
    var a = user();
    var b = user();
    friends(a, b);
    var bSocket = connect(b);
    assertError("Not in a room", bSocket.command("room:leave", null));

    var firstTab = connect(a);
    awaitPresence(bSocket, a, "ONLINE");
    var secondTab = connect(a);
    assertError("Not in a room", secondTab.command("room:leave", null));

    WsTestClients.closeQuietly(firstTab);
    firstTab.awaitClose();
    assertOk(secondTab.command("room:create", "{}"));
    awaitPresence(bSocket, a, "IN_ROOM");

    WsTestClients.closeQuietly(secondTab);
    awaitPresence(bSocket, a, "OFFLINE");
    assertEquals(List.of("ONLINE", "IN_ROOM", "OFFLINE"), presenceOf(bSocket, a));
  }

  @Test
  void roomInviteAckAndEventOverWs() {
    var a = user();
    var b = user();
    var stranger = user();
    friends(a, b);
    var aSocket = connect(a);
    var bFirstTab = connect(b);
    var bSecondTab = connect(b);
    var strangerSocket = connect(stranger);
    assertError("Not in a room", strangerSocket.command("room:leave", null));
    assertError("You are not in a room", aSocket.command("room:invite", "{\"userId\":\"" + b.id() + "\"}"));

    var code = aSocket.command("room:create", "{}").get("data").get("room").get("code").getStringValue();
    assertOk(aSocket.command("room:select-game", "{\"gameId\":\"higher-lower\"}"));
    assertError("Not a friend", aSocket.command("room:invite", "{\"userId\":\"" + stranger.id() + "\"}"));
    assertOk(aSocket.command("room:invite", "{\"userId\":\"" + b.id() + "\"}"));
    assertError("Invitation already sent", aSocket.command("room:invite", "{\"userId\":\"" + b.id() + "\"}"));

    for (var tab : List.of(bFirstTab, bSecondTab)) {
      var invite = tab.awaitPush("friends:invite", payload -> true);
      assertEquals(code, invite.get("roomCode").getStringValue());
      assertEquals("Higher or Lower", invite.get("gameName").getStringValue());
      assertEquals(a.id(), invite.get("from").get("id").getStringValue());
      assertEquals(a.name(), invite.get("from").get("username").getStringValue());
      assertEquals("DEFAULT", invite.get("from").get("avatar").get("type").getStringValue());
      assertEquals(36, invite.get("inviteId").getStringValue().length());
      var expiresAt = Instant.parse(invite.get("expiresAt").getStringValue());
      var inTenMinutes = Instant.now().plus(10, ChronoUnit.MINUTES);
      assertTrue(Math.abs(expiresAt.toEpochMilli() - inTenMinutes.toEpochMilli()) < 60_000, expiresAt.toString());
    }

    assertOk(bFirstTab.command("room:join", "{\"code\":\"" + code + "\"}"));
    assertError("Already in this room", aSocket.command("room:invite", "{\"userId\":\"" + b.id() + "\"}"));

    // Ida y vuelta por la conexión del extraño: lo que se le fuera a enviar antes ya habría llegado.
    assertError("Not in a room", strangerSocket.command("room:leave", null));
    assertTrue(strangerSocket.received.stream().noneMatch(m -> m.get("ok") == null
        && "friends:invite".equals(m.get("event").getStringValue())), strangerSocket.received.toString());
  }

  @Test
  void strangerReceivesNothing() {
    var a = user();
    var b = user();
    var stranger = user();
    friends(a, b);
    var bSocket = connect(b);
    var strangerSocket = connect(stranger);
    assertError("Not in a room", bSocket.command("room:leave", null));
    assertError("Not in a room", strangerSocket.command("room:leave", null));

    var aSocket = connect(a);
    awaitPresence(bSocket, a, "ONLINE");
    assertOk(aSocket.command("room:create", "{}"));
    awaitPresence(bSocket, a, "IN_ROOM");

    // Ida y vuelta por la conexión del extraño: lo que se le fuera a enviar antes ya habría llegado.
    assertError("Not in a room", strangerSocket.command("room:leave", null));
    assertTrue(strangerSocket.received.stream().noneMatch(m -> m.get("ok") == null
        && m.get("event").getStringValue().startsWith("friends:")), strangerSocket.received.toString());
  }
}

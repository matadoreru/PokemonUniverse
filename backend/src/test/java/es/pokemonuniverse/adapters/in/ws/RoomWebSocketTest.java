package es.pokemonuniverse.adapters.in.ws;

import static es.pokemonuniverse.adapters.in.ws.WsTestClients.assertError;
import static es.pokemonuniverse.adapters.in.ws.WsTestClients.assertOk;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.rooms.GameCatalogProvider;
import es.pokemonuniverse.application.rooms.GameCatalogs;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import io.micronaut.context.annotation.Primary;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.websocket.WebSocketClient;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Transporte {@code /ws}: handshake por cookie, sobre {@code {id,event,payload}}, acks, pushes y límites. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "RoomWebSocketTest")
class RoomWebSocketTest {

  private static final ObjectMapper JSON = ObjectMapper.getDefault();

  /** El catálogo de la base de datos de Test Resources está vacío: las partidas usan la fixture dorada. */
  @Singleton
  @Primary
  @Requires(property = "spec.name", value = "RoomWebSocketTest")
  static class GoldenCatalogProvider implements GameCatalogProvider {
    @Override
    public GameCatalogs loadPokemonCatalog() {
      return GameCatalogs.of(GoldenCatalogs.load("gen1-2"));
    }
  }

  /** Reloj manual del límite de eventos: el test de límite no depende de la velocidad real. */
  @Singleton
  @Replaces(WsClock.class)
  @Requires(property = "spec.name", value = "RoomWebSocketTest")
  static class ManualWsClock extends WsClock {
    final AtomicLong now = new AtomicLong(1_000_000);

    @Override
    public long now() {
      return now.get();
    }
  }

  @Inject @Client("/") WebSocketClient client;
  @Inject IdentityTokens tokens;
  @Inject ManualWsClock clock;

  private WsTestClients clients;

  @BeforeEach
  void openClients() {
    clients = new WsTestClients(client, tokens);
  }

  @AfterEach
  void closeSockets() {
    clients.closeAll();
  }

  private MutableHttpRequest<?> user(String id, String name) {
    return clients.user(id, name);
  }

  private TestSocket connect(MutableHttpRequest<?> request) {
    return clients.connect(request);
  }

  @Test
  void closesWith4401WithoutAValidCookie() {
    var anonymous = connect(HttpRequest.GET("/ws"));
    var reason = anonymous.awaitClose();
    assertEquals(4401, reason.getCode());
    assertEquals("Authentication required", reason.getReason());
    assertTrue(anonymous.received.isEmpty());

    var forged = connect(HttpRequest.GET("/ws").cookie(Cookie.of("pu_session", "not-a-token")));
    assertEquals(4401, forged.awaitClose().getCode());
  }

  @Test
  void playsARoomOverTheSocketAndReplacesAnOlderConnection() {
    var host = connect(user("ws_host", "Host"));
    var guest = connect(user("ws_guest", "Guest"));

    var created = host.command("room:create", "{}");
    assertTrue(created.get("ok").getBooleanValue(), created.toString());
    var room = created.get("data").get("room");
    var code = room.get("code").getStringValue();
    assertEquals(6, code.length());
    assertTrue(room.get("game").isNull(), "las claves null de RoomView viajan presentes");

    var joined = guest.command("room:join", "{\"code\":\"" + code + "\"}");
    assertTrue(joined.get("ok").getBooleanValue(), joined.toString());
    assertEquals(code, joined.get("data").get("room").get("code").getStringValue());

    assertOk(guest.command("room:set-ready", "{\"ready\":true}"));
    var selected = host.command("room:select-game", "{\"gameId\":\"higher-lower\"}");
    assertOk(selected);
    assertEquals(Map.of(), asMap(selected.get("data")));
    assertOk(host.command("room:start-game", null));

    var hostState = host.awaitPush("room:state", view -> "ROUND_ACTIVE".equals(text(view, "phase")));
    guest.awaitPush("room:state", view -> "ROUND_ACTIVE".equals(text(view, "phase")));

    var action = "{\"gameInstanceId\":\"" + hostState.get("gameSkipState").get("gameInstanceId").getStringValue()
        + "\",\"actionEpoch\":" + quote(hostState.get("gameActionEpoch").getStringValue())
        + ",\"action\":{\"type\":\"ANSWER\",\"choice\":\"HIGHER\"}}";
    assertOk(host.command("game:action", action));

    // Review Focus 3: una pestaña nueva del mismo usuario reemplaza a la conexión antigua, que sigue abierta.
    var newerHost = connect(user("ws_host", "Host"));
    var restored = newerHost.awaitPush("session:restored", view -> true);
    assertEquals(code, text(restored, "code"));
    var stale = host.command("room:set-ready", "{\"ready\":true}");
    assertError("Esta conexión ha sido reemplazada por una sesión más reciente.", stale);
    assertFalse(host.closed.isDone());

    WsTestClients.closeQuietly(guest);
    newerHost.awaitPush("room:state", view -> presenceOf(view, "ws_guest").equals("TEMPORARILY_DISCONNECTED"));

    // Dentro de la gracia, el mismo usuario vuelve con una conexión nueva y recupera su sala.
    var returningGuest = connect(user("ws_guest", "Guest"));
    assertEquals(code, text(returningGuest.awaitPush("session:restored", view -> true), "code"));
    newerHost.awaitPush("room:state", view -> presenceOf(view, "ws_guest").equals("CONNECTED"));
  }

  @Test
  void answersMalformedFramesWithoutClosing() {
    var socket = connect(user("ws_malformed", "Malformed"));
    socket.send("esto no es JSON");
    assertError("Mensaje inválido", socket.awaitIdlessAck());
    socket.send("[1,2,3]");
    assertError("Mensaje inválido", socket.awaitIdlessAck());
    socket.send("{\"id\":\"x1\",\"payload\":{}}");
    assertError("Mensaje inválido", socket.awaitAck("x1"));
    assertError("Evento desconocido", socket.command("room:explode", "{}"));
    assertError("Not in a room", socket.command("room:leave", null));
    assertFalse(socket.closed.isDone());
  }

  @Test
  void closesOversizedFramesWith1009AndKeepsTheRoomAlive() {
    var host = connect(user("ws_big_host", "Host"));
    var guest = connect(user("ws_big_guest", "Guest"));
    var code = host.command("room:create", "{}").get("data").get("room").get("code").getStringValue();
    assertOk(guest.command("room:join", "{\"code\":\"" + code + "\"}"));

    var padding = "x".repeat(40 * 1024);
    guest.send("{\"id\":\"big\",\"event\":\"room:set-ready\",\"payload\":{\"ready\":true,\"pad\":\"" + padding + "\"}}");
    assertEquals(1009, guest.awaitClose().getCode());

    host.awaitPush("room:state", view -> presenceOf(view, "ws_big_guest").equals("TEMPORARILY_DISCONNECTED"));
    assertOk(host.command("room:select-game", "{\"gameId\":\"higher-lower\"}"));
  }

  @Test
  void rateLimitsFiftyCommandsPerTenSecondsExceptCursors() {
    var socket = connect(user("ws_flood", "Flood"));
    for (int i = 0; i < 50; i++) assertError("Not in a room", socket.command("room:leave", null));
    assertError("Rate limit exceeded", socket.command("room:leave", null));
    // Los cursores no cuentan: siguen llegando al coordinador.
    assertError("Not in a room", socket.command("who-is-who:cursor", "{\"x\":0.5,\"y\":0.5}"));
    clock.now.addAndGet(9_999);
    assertError("Rate limit exceeded", socket.command("room:leave", null));
    clock.now.addAndGet(1);
    assertError("Not in a room", socket.command("room:leave", null));
    assertFalse(socket.closed.isDone());
  }

  @Test
  void countsMalformedFramesTowardsTheLimit() {
    var socket = connect(user("ws_garbage", "Garbage"));
    for (int i = 0; i < 50; i++) {
      socket.send("basura");
      assertError("Mensaje inválido", socket.awaitIdlessAck());
    }
    assertError("Rate limit exceeded", socket.command("room:leave", null));
    socket.send("basura");
    assertError("Rate limit exceeded", socket.command("room:leave", null));
    assertTrue(socket.idlessAcks.isEmpty(), "un mensaje rechazado sin id no recibe respuesta");
    assertFalse(socket.closed.isDone());
  }

  // ------------------------------------------------------------------------------------------------ utilidades

  private static String text(JsonNode node, String key) {
    var value = node.get(key);
    return value == null || !value.isString() ? "" : value.getStringValue();
  }

  private static String presenceOf(JsonNode view, String playerId) {
    for (var member : view.get("members").values()) {
      if (playerId.equals(text(member, "id"))) return text(member, "presence");
    }
    return "";
  }

  private static String quote(String value) {
    try {
      return JSON.writeValueAsString(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> asMap(JsonNode node) {
    try {
      return JSON.readValueFromTree(node, Map.class);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

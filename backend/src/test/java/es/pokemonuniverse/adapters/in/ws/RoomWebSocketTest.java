package es.pokemonuniverse.adapters.in.ws;

import static es.pokemonuniverse.adapters.in.ws.WsTestClients.assertError;
import static es.pokemonuniverse.adapters.in.ws.WsTestClients.assertOk;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.daily.DailyGames;
import es.pokemonuniverse.application.daily.DailyKey;
import es.pokemonuniverse.application.rooms.ExecutorRoomSchedulers;
import es.pokemonuniverse.application.rooms.GameCatalogProvider;
import es.pokemonuniverse.application.rooms.GameCatalogs;
import es.pokemonuniverse.application.rooms.RoomSchedulers;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.application.time.SystemClock;
import es.pokemonuniverse.domain.daily.DailyCalendar;
import es.pokemonuniverse.domain.daily.DailySeed;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import io.micronaut.context.annotation.Primary;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.websocket.WebSocketClient;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;
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

  /**
   * Reloj de las salas con desplazamiento: el reto diario juega en una fecha lejana propia del test, y el avance rápido
   * lo mueve al disparar cada plazo.
   */
  @Singleton
  @Replaces(SystemClock.class)
  @Requires(property = "spec.name", value = "RoomWebSocketTest")
  static class OffsetClock implements Clock {
    final AtomicLong offset = new AtomicLong();

    @Override
    public long now() {
      return System.currentTimeMillis() + offset.get();
    }
  }

  /**
   * Temporizadores reales salvo en avance rápido: entonces cada plazo se dispara enseguida y adelanta el reloj lo que
   * faltaba, para jugar una partida entera por tiempo vencido sin esperar.
   */
  @Singleton
  @Replaces(ExecutorRoomSchedulers.class)
  @Requires(property = "spec.name", value = "RoomWebSocketTest")
  static class FastForwardSchedulers implements RoomSchedulers {
    private final ScheduledExecutorService executor =
        Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("test-room-timers").factory());
    private final OffsetClock clock;
    volatile boolean fast;

    FastForwardSchedulers(OffsetClock clock) {
      this.clock = clock;
    }

    @Override
    public Runnable schedule(long delayMs, Runnable task) {
      long delay = Math.max(0, delayMs);
      var future = fast
          ? executor.schedule(() -> {
            clock.offset.addAndGet(delay);
            Thread.ofVirtual().start(task);
          }, 2, TimeUnit.MILLISECONDS)
          : executor.schedule(() -> Thread.ofVirtual().start(task), delay, TimeUnit.MILLISECONDS);
      return () -> future.cancel(false);
    }

    @PreDestroy
    void shutdown() {
      executor.shutdownNow();
    }
  }

  @Inject @Client("/") WebSocketClient client;
  @Inject @Client("/") HttpClient http;
  @Inject IdentityTokens tokens;
  @Inject ManualWsClock clock;
  @Inject WsSessions sessions;
  @Inject OffsetClock roomClock;
  @Inject FastForwardSchedulers schedulers;
  @Inject DailyKey dailyKey;
  @Inject UserRepository users;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

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
    // «Siguiente» (room:reveal-next): fuera de un revelado no hace nada; mal formado, error en español.
    assertError("Petición de «Siguiente» no válida.", host.command("room:reveal-next", "{}"));
    assertOk(host.command("room:reveal-next", "{\"gameInstanceId\":\""
        + hostState.get("gameSkipState").get("gameInstanceId").getStringValue() + "\",\"actionEpoch\":"
        + quote(hostState.get("gameActionEpoch").getStringValue()) + "}"));
    assertOk(host.command("game:action", action));

    // Review Focus 3: una pestaña nueva del mismo usuario reemplaza a la conexión antigua, que sigue abierta.
    var newerHost = connect(user("ws_host", "Host"));
    assertOk(newerHost.command("session:attach", null));
    var restored = newerHost.awaitPush("session:restored", view -> true);
    assertEquals(code, text(restored, "code"));
    var stale = host.command("room:set-ready", "{\"ready\":true}");
    assertError("Estás jugando en dos pestañas o dispositivos con esta cuenta. Recarga esta página para seguir jugando aquí.", stale);
    assertFalse(host.closed.isDone());

    WsTestClients.closeQuietly(guest);
    newerHost.awaitPush("room:state", view -> presenceOf(view, "ws_guest").equals("TEMPORARILY_DISCONNECTED"));

    // Dentro de la gracia, el mismo usuario vuelve con una conexión nueva y recupera su sala.
    var returningGuest = connect(user("ws_guest", "Guest"));
    assertOk(returningGuest.command("session:attach", null));
    assertEquals(code, text(returningGuest.awaitPush("session:restored", view -> true), "code"));
    newerHost.awaitPush("room:state", view -> presenceOf(view, "ws_guest").equals("CONNECTED"));
  }

  /**
   * Una conexión que no se ha enganchado a la sesión de sala (otra página abierta para amigos) no toca el asiento: el
   * jugador sigue recibiendo la sala y mandando en la conexión enganchada, y su cierre no lo desconecta.
   */
  @Test
  void aConnectionThatNeverAttachesLeavesTheSeatAlone() {
    var host = connect(user("ws_seat", "Seat"));
    var guest = connect(user("ws_seat_guest", "Guest"));
    var code = host.command("room:create", "{}").get("data").get("room").get("code").getStringValue();
    assertOk(guest.command("room:join", "{\"code\":\"" + code + "\"}"));
    var hostConnection = sessions.connectionsOf("ws_seat").getFirst();

    var otherPage = connect(user("ws_seat", "Seat"));
    // Un comando con ack: su apertura ya se procesó (va antes en la misma cola).
    assertError("Evento desconocido", otherPage.command("barrier", null));
    assertTrue(otherPage.received.stream().noneMatch(message -> message.get("event") != null
        && "session:restored".equals(message.get("event").getStringValue())), "sin engancharse no se restaura la sala");
    assertOk(host.command("room:select-game", "{\"gameId\":\"higher-lower\"}"));
    host.awaitPush("room:state", view -> "higher-lower".equals(text(view, "selectedGameId")));

    var otherConnection = sessions.connectionsOf("ws_seat").stream()
        .filter(connection -> !connection.id().equals(hostConnection.id())).findFirst().orElseThrow();
    WsTestClients.closeQuietly(otherPage);
    awaitRemoved(otherConnection);
    var drained = new CompletableFuture<Void>();
    otherConnection.enqueue(() -> drained.complete(null)); // detrás del cierre en la cola de esa conexión
    drained.orTimeout(TestSocket.WAIT.toMillis(), TimeUnit.MILLISECONDS).join();

    assertOk(host.command("room:select-game", "{\"gameId\":\"type-duel\"}"));
    var seen = guest.awaitPush("room:state", view -> "type-duel".equals(text(view, "selectedGameId")));
    assertEquals("CONNECTED", presenceOf(seen, "ws_seat"));
    host.awaitPush("room:state", view -> "type-duel".equals(text(view, "selectedGameId")));
  }

  /** Engancharse desde otra conexión sí toma el asiento (gana la última) y le manda {@code session:restored}. */
  @Test
  void attachingFromAnotherConnectionTakesTheSeat() {
    var host = connect(user("ws_attach", "Attach"));
    var code = host.command("room:create", "{}").get("data").get("room").get("code").getStringValue();

    var roomTab = connect(user("ws_attach", "Attach"));
    assertOk(roomTab.command("session:attach", null));
    assertEquals(code, text(roomTab.awaitPush("session:restored", view -> true), "code"));
    assertError("Estás jugando en dos pestañas o dispositivos con esta cuenta. Recarga esta página para seguir jugando aquí.",
        host.command("room:select-game", "{\"gameId\":\"higher-lower\"}"));
    assertOk(roomTab.command("room:select-game", "{\"gameId\":\"higher-lower\"}"));

    // Engancharse sin sala es inocuo.
    var lonely = connect(user("ws_attach_none", "None"));
    assertOk(lonely.command("session:attach", null));
  }

  private void awaitRemoved(WsSessions.Connection connection) {
    long deadline = System.nanoTime() + TestSocket.WAIT.toNanos();
    while (sessions.get(connection.id()) != null) {
      if (System.nanoTime() > deadline) throw new AssertionError("La conexión no se cerró");
      Thread.onSpinWait();
    }
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

  /**
   * Cursores de {@code who-is-who-pokemon}: el canal del motor ({@code getCursorChannel}) solo existe en
   * {@code TURN_ACTIVE} y para el propio equipo. Con tres jugadores BLUE tiene dos miembros y juega primero.
   */
  @Test
  void relaysWhoIsWhoCursorsToTeammatesAndResetsThemWhenTheTurnEnds() {
    var host = connect(user("ws_wiw_host", "Host"));
    var second = connect(user("ws_wiw_second", "Second"));
    var third = connect(user("ws_wiw_third", "Third"));
    var code = host.command("room:create", "{}").get("data").get("room").get("code").getStringValue();
    assertOk(second.command("room:join", "{\"code\":\"" + code + "\"}"));
    assertOk(third.command("room:join", "{\"code\":\"" + code + "\"}"));
    assertOk(second.command("room:set-ready", "{\"ready\":true}"));
    assertOk(third.command("room:set-ready", "{\"ready\":true}"));
    assertOk(host.command("room:select-game", "{\"gameId\":\"who-is-who-pokemon\"}"));
    assertOk(host.command("room:start-game", null));

    // Cada cliente consume hasta su vista TURN_ACTIVE: así descarta también el cursors-reset del arranque, y la vista
    // del remitente trae la época con la que luego termina el turno (los cursores no la cambian).
    var sockets = Map.of("ws_wiw_host", host, "ws_wiw_second", second, "ws_wiw_third", third);
    var views = new HashMap<String, JsonNode>();
    sockets.forEach((id, socket) ->
        views.put(id, socket.awaitPush("room:state", state -> "TURN_ACTIVE".equals(gamePhase(state)))));
    var view = views.get("ws_wiw_host");
    var blue = view.get("game").get("teams").get("BLUE").get("playerIds");
    var red = view.get("game").get("teams").get("RED").get("playerIds");
    assertEquals(2, blue.size());
    var sender = sockets.get(blue.get(0).getStringValue());
    var teammate = sockets.get(blue.get(1).getStringValue());
    var rival = sockets.get(red.get(0).getStringValue());
    var senderId = blue.get(0).getStringValue();
    var boardPokemonId = view.get("game").get("board").get(0).get("id").getStringValue();

    var cursor = "{\"x\":0.25,\"y\":0.75,\"pokemonId\":\"" + boardPokemonId + "\",\"cardX\":0.5,\"cardY\":0.5}";
    assertOk(sender.command("who-is-who:cursor", cursor));
    var relayed = teammate.awaitPush("who-is-who:cursor", payload -> senderId.equals(text(payload, "playerId")));
    assertEquals(boardPokemonId, text(relayed, "pokemonId"));
    assertEquals(0.25, relayed.get("x").getDoubleValue());
    assertEquals(0.5, relayed.get("cardY").getDoubleValue());
    assertTrue(relayed.get("updatedAt").isNumber(), relayed.toString());

    assertError("Ese Pokémon no está en el tablero.", sender.command("who-is-who:cursor",
        "{\"x\":0.5,\"y\":0.5,\"pokemonId\":\"no-esta-en-el-tablero\",\"cardX\":0.5,\"cardY\":0.5}"));

    assertOk(sender.command("who-is-who:cursor-clear", null));
    teammate.awaitPush("who-is-who:cursor-clear", payload -> senderId.equals(text(payload, "playerId")));

    // END_TURN cambia currentTeam y turnNumber: la época de acción cambia y el coordinador reinicia los cursores.
    var senderView = views.get(senderId);
    var endTurn = "{\"gameInstanceId\":\"" + senderView.get("gameSkipState").get("gameInstanceId").getStringValue()
        + "\",\"actionEpoch\":" + quote(senderView.get("gameActionEpoch").getStringValue())
        + ",\"action\":{\"type\":\"END_TURN\"}}";
    assertOk(sender.command("game:action", endTurn));
    for (var socket : List.of(sender, teammate, rival)) socket.awaitPush("who-is-who:cursors-reset", payload -> true);
    assertTrue(rival.received.stream().noneMatch(message -> message.get("event") != null
        && "who-is-who:cursor".equals(message.get("event").getStringValue())), "el equipo rival no ve los cursores");
  }

  /**
   * {@code daily:start {}} responde {@code {room}} con la sala del reto, y al terminar la partida (por tiempo vencido,
   * en avance rápido) llega {@code daily:recorded {date, gameId}} por el mismo socket. Un invitado recibe el error.
   */
  @Test
  void dailyStartOverWsReturnsRoomAndRecordedEventArrives() throws SQLException {
    var guest = connect(user("ws_daily_guest", "Guest"));
    assertError("Registered account required", guest.command("daily:start", "{}"));

    // Una fecha lejana y distinta en cada ejecución; la fixture gen1-2 no basta para Learnset Guess.
    var day = LocalDate.of(2400, 1, 1).plusDays(Math.floorMod(UUID.randomUUID().getMostSignificantBits(), 200_000));
    while (drawnGame(day).equals("learnset-guess")) day = day.plusDays(1);
    var gameId = drawnGame(day);
    long noon = day.atTime(LocalTime.NOON).atZone(DailyCalendar.ZONE).toInstant().toEpochMilli();
    roomClock.offset.set(noon - System.currentTimeMillis());
    String userId = null;
    try {
      var account = register();
      userId = account[0];
      var player = connect(HttpRequest.GET("/ws").header("Cookie", account[1]));
      schedulers.fast = true;
      var ack = player.command("daily:start", "{}");
      assertOk(ack);
      var daily = ack.get("data").get("room").get("daily");
      assertEquals(gameId, text(daily, "gameId"));
      assertEquals(day.toString(), text(daily, "date"));
      assertTrue(daily.get("result").isNull(), daily.toString());

      var recorded = player.awaitPush("daily:recorded", payload -> true);
      assertEquals(Map.of("date", day.toString(), "gameId", gameId), asMap(recorded));
      schedulers.fast = false;
      assertError("Leave your current room first", player.command("daily:start", "{}"));
      assertOk(player.command("room:leave", null));
    } finally {
      schedulers.fast = false;
      roomClock.offset.set(0);
      if (userId != null) users.deleteById(userId); // borra en cascada su DailyResult
      try (var connection = resolver.resolve(dataSource).getConnection();
          var statement = connection.prepareStatement("DELETE FROM \"DailyChallenge\" WHERE \"date\" = ?")) {
        statement.setObject(1, day);
        statement.executeUpdate();
      }
    }
  }

  private String drawnGame(LocalDate day) {
    return DailyGames.ofTheDay(DailySeed.seed(dailyKey.bytes(), day)).gameId();
  }

  /** Cuenta registrada de verdad (el reto exige {@code USER} y una fila en {@code User}): {@code [id, cookie]}. */
  @SuppressWarnings("unchecked")
  private String[] register() {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var res = http.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", "wd_" + u, "email", "wd" + u + "@mail.com", "password", "0123456789")), Map.class);
    var cookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    return new String[] {(String) ((Map<String, Object>) res.body().get("user")).get("id"), cookie};
  }

  // ------------------------------------------------------------------------------------------------ utilidades

  private static String text(JsonNode node, String key) {
    var value = node.get(key);
    return value == null || !value.isString() ? "" : value.getStringValue();
  }

  private static String gamePhase(JsonNode view) {
    var game = view.get("game");
    return game == null || game.isNull() ? "" : text(game, "phase");
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

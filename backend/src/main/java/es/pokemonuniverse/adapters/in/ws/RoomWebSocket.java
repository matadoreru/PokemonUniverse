package es.pokemonuniverse.adapters.in.ws;

import es.pokemonuniverse.adapters.in.ws.WsEnvelope.AckMessage;
import es.pokemonuniverse.adapters.in.ws.WsEnvelope.ClientMessage;
import es.pokemonuniverse.adapters.in.ws.WsSessions.Connection;
import es.pokemonuniverse.application.friends.RoomInvitations;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.rooms.RoomException;
import es.pokemonuniverse.application.rooms.RoomView;
import es.pokemonuniverse.domain.game.engine.EngineException;
import io.micronaut.context.annotation.Value;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpRequest;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.websocket.CloseReason;
import io.micronaut.websocket.WebSocketSession;
import io.micronaut.websocket.annotation.OnClose;
import io.micronaut.websocket.annotation.OnError;
import io.micronaut.websocket.annotation.OnMessage;
import io.micronaut.websocket.annotation.OnOpen;
import io.micronaut.websocket.annotation.ServerWebSocket;
import java.util.Map;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Transporte de salas {@code /ws}, el {@code io.on('connection')} + {@code RoomManager.bind} de Node.
 *
 * <p>El event loop solo verifica la cookie, parsea el mensaje (≤ 32 KiB), aplica el límite de eventos y encola: cada
 * conexión ejecuta apertura, comandos y cierre en orden en un hilo virtual propio ({@link WsSessions.Connection#enqueue}),
 * y el coordinador toma ahí el lock de la sala. Un mensaje rechazado por el límite no llega a la cola.
 * Mensajes de más de {@value #MAX_FRAME_BYTES} bytes ({@code maxHttpBufferSize} de Node) cierran con 1009.
 *
 * <p>Abrir la conexión no toca la sala: la cuenta registrada tiene el {@code /ws} abierto en toda página (amigos). Solo
 * {@code session:attach} (que el cliente envía en {@code /play} y {@code /room}), {@code room:create} y {@code room:join}
 * hacen de esta conexión la vigente del jugador; cerrar una que nunca lo fue no cambia nada.
 *
 * <p>Con {@code pu.rooms.enabled=false} (producción hasta el corte 2D; hoy solo arranques sin esa configuración) toda conexión se cierra con 4403 al abrirse,
 * antes de registrar la sesión: el coordinador nunca la ve.
 */
@ServerWebSocket("/ws")
public class RoomWebSocket {

  static final int MAX_FRAME_BYTES = 32_768;
  static final CloseReason AUTHENTICATION_REQUIRED = new CloseReason(4401, "Authentication required");
  static final CloseReason ROOMS_DISABLED = new CloseReason(4403, "Rooms disabled");
  static final String INVALID_MESSAGE = "Mensaje inválido";
  static final String UNKNOWN_EVENT = "Evento desconocido";
  static final String RATE_LIMITED = "Rate limit exceeded";
  static final String UNEXPECTED = "Unexpected error";
  static final String CURSOR_REJECTED = "Cursor rechazado";
  static final String CURSOR = "who-is-who:cursor";
  static final String CURSOR_CLEAR = "who-is-who:cursor-clear";

  private static final Logger LOG = LoggerFactory.getLogger(RoomWebSocket.class);

  private final RoomCoordinator coordinator;
  private final RoomInvitations invitations;
  private final WsSessions sessions;
  private final WsHandshake handshake;
  private final JsonMapper json;
  private final boolean roomsEnabled;

  public RoomWebSocket(RoomCoordinator coordinator, RoomInvitations invitations, WsSessions sessions,
      WsHandshake handshake, JsonMapper json, @Value("${pu.rooms.enabled:false}") boolean roomsEnabled) {
    this.coordinator = coordinator;
    this.invitations = invitations;
    this.sessions = sessions;
    this.handshake = handshake;
    this.json = json;
    this.roomsEnabled = roomsEnabled;
  }

  @OnOpen
  public void onOpen(WebSocketSession session, HttpRequest<?> request) {
    if (!roomsEnabled) {
      session.close(ROOMS_DISABLED);
      return;
    }
    var identity = handshake.identify(request).orElse(null);
    if (identity == null) {
      session.close(AUTHENTICATION_REQUIRED);
      return;
    }
    var connection = sessions.register(session, identity);
    connection.enqueue(() -> {
      if (!coordinator.connect(identity, connection.id())) session.close(CloseReason.GOING_AWAY);
    });
  }

  @OnMessage(maxPayloadLength = MAX_FRAME_BYTES)
  public void onMessage(String text, WebSocketSession session) {
    var connection = sessions.get(session.getId());
    if (connection == null) return;
    var message = parse(text);
    var id = message == null ? null : message.id();
    // socket.use de Node: todo evento salvo los cursores cuenta, también los mal formados; el rechazado no.
    if (!(message != null && isCursor(message.event())) && !connection.limiter.tryAcquire()) {
      if (id != null) connection.reply(AckMessage.error(id, RATE_LIMITED));
      return;
    }
    if (message == null || message.event() == null) {
      connection.reply(AckMessage.error(id, INVALID_MESSAGE));
      return;
    }
    connection.enqueue(() -> handle(connection, message));
  }

  @OnClose
  public void onClose(WebSocketSession session) {
    var connection = sessions.remove(session.getId());
    if (connection == null) return;
    connection.enqueue(() -> coordinator.disconnect(connection.identity.id(), connection.id()));
  }

  @OnError
  public void onError(WebSocketSession session, Throwable error) {
    LOG.warn("Error en la conexión WebSocket {}: {}", session.getId(), error.toString());
    if (session.isOpen()) session.close(CloseReason.INTERNAL_ERROR);
  }

  // --------------------------------------------------------------------------------------------- mensajes

  /**
   * Nunca lanza: todo error de un comando, incluido un {@link Error} de un motor, se responde con un ack y la conexión
   * sigue abierta (Review Focus 4).
   */
  void handle(Connection connection, ClientMessage message) {
    var id = message.id();
    boolean cursor = isCursor(message.event());
    // guard() de Node: un comando sin callback de ack no se ejecuta. Los cursores sí (su ack es opcional).
    if (id == null && !cursor) return;
    AckMessage ack;
    try {
      coordinator.assertAcceptingCommands();
      ack = AckMessage.ok(id, dispatch(connection, message));
    } catch (RoomException | EngineException | IllegalArgumentException error) {
      var fallback = cursor ? CURSOR_REJECTED : UNEXPECTED;
      ack = AckMessage.error(id, error.getMessage() != null ? error.getMessage() : fallback);
    } catch (Throwable error) {
      if (cursor) {
        LOG.debug("Cursor rechazado en la conexión {}", connection.id(), error);
        ack = AckMessage.error(id, CURSOR_REJECTED);
      } else {
        LOG.error("Error inesperado en {} de la conexión {}", message.event(), connection.id(), error);
        ack = AckMessage.error(id, UNEXPECTED);
      }
    }
    if (id != null) connection.reply(ack);
  }

  private static boolean isCursor(@Nullable String event) {
    return CURSOR.equals(event) || CURSOR_CLEAR.equals(event);
  }

  /**
   * {@code {"id", "event", "payload"}}: {@code null} si no es un objeto JSON o su {@code id} no es texto; un
   * {@link ClientMessage} con {@code event} nulo si falta el evento (se responde con su {@code id}).
   */
  @Nullable
  private ClientMessage parse(String text) {
    JsonNode root;
    try {
      root = json.readValue(text, JsonNode.class);
    } catch (Exception error) {
      return null;
    }
    if (root == null || !root.isObject()) return null;
    var idNode = root.get("id");
    if (idNode != null && !idNode.isNull() && !idNode.isString()) return null;
    var id = idNode == null || idNode.isNull() ? null : idNode.getStringValue();
    var eventNode = root.get("event");
    var event = eventNode != null && eventNode.isString() ? eventNode.getStringValue() : null;
    return new ClientMessage(id, event, root.get("payload"));
  }

  /** La tabla de {@code bind()}: mismos eventos y mismos campos del payload que Node. */
  private JsonNode dispatch(Connection connection, ClientMessage message) {
    var identity = connection.identity;
    var playerId = identity.id();
    var connectionId = connection.id();
    var payload = message.payload();
    return switch (message.event()) {
      // Sin current(): engancharse es justo lo que convierte a esta conexión en la vigente.
      case "session:attach" -> {
        coordinator.attach(identity, connectionId);
        yield empty();
      }
      case "room:create" -> roomData(coordinator.create(identity, connectionId, field(payload, "maxPlayers")));
      case "room:join" -> roomData(coordinator.join(identity, connectionId, field(payload, "code")));
      case "room:leave" -> current(connection, () -> coordinator.leave(playerId));
      case "room:select-game" -> current(connection, () -> coordinator.selectGame(playerId, text(payload, "gameId")));
      case "room:update-config" -> current(connection, () -> coordinator.updateConfig(playerId, field(payload, "config")));
      case "room:update-game-config" -> current(connection,
          () -> coordinator.updateGameConfig(playerId, text(payload, "gameId"), field(payload, "config")));
      case "room:update-session" -> current(connection, () -> coordinator.updateSession(playerId, field(payload, "mode")));
      case "room:update-game-selection" -> current(connection,
          () -> coordinator.updateGameSelection(playerId, field(payload, "mode")));
      case "room:update-allowed-modes" -> current(connection,
          () -> coordinator.updateAllowedModes(playerId, text(payload, "gameId"), field(payload, "modes")));
      case "room:vote-next-game" -> current(connection,
          () -> coordinator.voteNextGame(playerId, text(payload, "optionId")));
      case "room:set-role" -> current(connection,
          () -> coordinator.setRoomRole(playerId, text(payload, "playerId"), field(payload, "role")));
      case "room:transfer-host" -> current(connection, () -> coordinator.transferHost(playerId, text(payload, "playerId")));
      case "room:kick" -> current(connection, () -> coordinator.kick(playerId, text(payload, "playerId")));
      case "room:set-ready" -> current(connection, () -> coordinator.setReady(playerId, field(payload, "ready")));
      case "room:start-game" -> current(connection, () -> coordinator.startGame(playerId));
      case "room:continue-session" -> current(connection, () -> coordinator.continueSession(playerId));
      case "room:return-lobby" -> current(connection, () -> coordinator.returnLobby(playerId));
      case "room:end-session" -> current(connection, () -> coordinator.endSession(playerId));
      case "game:skip-vote:set" -> current(connection, () -> coordinator.setGameSkipVote(playerId, payload));
      case "game:action" -> current(connection, () -> coordinator.gameAction(playerId, payload));
      // Sin current(): withConnection tomaría el lock de la sala, y la invitación lee la BD y envía sin él.
      case "room:invite" -> {
        invitations.invite(identity, text(payload, "userId"));
        yield empty();
      }
      case CURSOR -> {
        coordinator.updateWhoIsWhoCursor(playerId, connectionId, payload);
        yield empty();
      }
      case CURSOR_CLEAR -> {
        coordinator.clearWhoIsWhoCursor(playerId, connectionId);
        yield empty();
      }
      default -> throw new RoomException(UNKNOWN_EVENT);
    };
  }

  /** {@code currentSocket}: el comando solo corre si esta es la conexión vigente del jugador (Review Focus 3). */
  private JsonNode current(Connection connection, Runnable operation) {
    Supplier<Void> wrapped = () -> {
      operation.run();
      return null;
    };
    coordinator.withConnection(connection.identity.id(), connection.id(), wrapped);
    return empty();
  }

  private JsonNode roomData(RoomView room) {
    return sessions.tree(Map.of("room", room));
  }

  private static JsonNode empty() {
    return JsonNode.createObjectNode(Map.of());
  }

  /** {@code payload.key}: ausente si el payload no es un objeto, como leer una propiedad en JS. */
  @Nullable
  private static JsonNode field(@Nullable JsonNode payload, String key) {
    return payload != null && payload.isObject() ? payload.get(key) : null;
  }

  @Nullable
  private static String text(@Nullable JsonNode payload, String key) {
    var value = field(payload, key);
    return value != null && value.isString() ? value.getStringValue() : null;
  }
}

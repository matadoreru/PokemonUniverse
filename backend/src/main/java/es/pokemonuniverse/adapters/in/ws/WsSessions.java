package es.pokemonuniverse.adapters.in.ws;

import es.pokemonuniverse.adapters.in.ws.WsEnvelope.AckMessage;
import es.pokemonuniverse.adapters.in.ws.WsEnvelope.PushMessage;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.context.annotation.Value;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.websocket.WebSocketSession;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Conexiones abiertas de {@code /ws}: sesión ↔ identidad ↔ {@code connectionId} (el id de la sesión). Cada conexión
 * procesa sus mensajes en orden sobre hilos virtuales, nunca en el event loop de Netty, y envía con
 * {@code sendAsync} para no bloquear a quien llama (el coordinador lo hace con el lock de la sala tomado).
 *
 * <p>Latido: cada {@code pu.ws.heartbeat-seconds} (25 s, el {@code pingInterval} de Socket.IO) envía un ping a cada
 * sesión abierta; el pong del navegador reinicia el temporizador de inactividad de Netty, que si no cerraría las salas
 * tranquilas al cumplirse {@code micronaut.server.idle-timeout}. Con 0 no hay latido.
 */
@Singleton
public class WsSessions {

  private static final Logger LOG = LoggerFactory.getLogger(WsSessions.class);

  /** Una conexión autenticada: su identidad, su límite de eventos y su cola de trabajo en serie. */
  final class Connection {

    final WebSocketSession session;
    final AuthUser identity;
    final WsRateLimiter limiter = new WsRateLimiter(clock::now);
    private CompletableFuture<Void> tail = CompletableFuture.completedFuture(null);

    private Connection(WebSocketSession session, AuthUser identity) {
      this.session = session;
      this.identity = identity;
    }

    String id() {
      return session.getId();
    }

    /** Encola {@code task} detrás de los anteriores de esta conexión; un fallo se registra y no corta la cola. */
    synchronized void enqueue(Runnable task) {
      tail = tail.thenRunAsync(() -> {
        try {
          task.run();
        } catch (Throwable error) {
          LOG.error("Fallo procesando la conexión WebSocket {}", id(), error);
        }
      }, workers);
    }

    void reply(AckMessage ack) {
      send(this, ack);
    }
  }

  private final ExecutorService workers = Executors.newVirtualThreadPerTaskExecutor();
  private final Map<String, Connection> connections = new ConcurrentHashMap<>();
  private static final byte[] PING = new byte[0];

  private final JsonMapper json;
  private final WsClock clock;
  @Nullable private final ScheduledExecutorService heartbeat;

  public WsSessions(JsonMapper json, WsClock clock, @Value("${pu.ws.heartbeat-seconds:25}") long heartbeatSeconds) {
    this.json = json;
    this.clock = clock;
    if (heartbeatSeconds > 0) {
      heartbeat = Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("ws-heartbeat").factory());
      heartbeat.scheduleAtFixedRate(this::pingAll, heartbeatSeconds, heartbeatSeconds, TimeUnit.SECONDS);
    } else {
      heartbeat = null;
    }
  }

  /** Un ping por sesión abierta; un fallo nunca detiene el latido. */
  void pingAll() {
    for (var connection : connections.values()) {
      try {
        if (!connection.session.isOpen()) continue;
        connection.session.sendPingAsync(PING).whenComplete((ignored, error) -> {
          if (error != null) LOG.debug("Ping WebSocket fallido a {}: {}", connection.id(), error.toString());
        });
      } catch (Throwable error) {
        LOG.debug("Ping WebSocket fallido a {}: {}", connection.id(), error.toString());
      }
    }
  }

  Connection register(WebSocketSession session, AuthUser identity) {
    var connection = new Connection(session, identity);
    connections.put(session.getId(), connection);
    return connection;
  }

  @Nullable
  Connection get(String connectionId) {
    return connections.get(connectionId);
  }

  @Nullable
  Connection remove(String connectionId) {
    return connections.remove(connectionId);
  }

  /** Envía {@code {event, payload}} a la conexión si sigue abierta y pertenece a {@code memberId}; si no, nada. */
  void push(String memberId, String connectionId, String event, @Nullable Object payload) {
    var connection = connections.get(connectionId);
    if (connection == null || !connection.identity.id().equals(memberId)) return;
    try {
      send(connection, new PushMessage(event, payload == null ? null : tree(payload)));
    } catch (RuntimeException error) {
      LOG.warn("No se pudo enviar {} a la conexión {}", event, connectionId, error);
    }
  }

  JsonNode tree(Object value) {
    if (value instanceof JsonNode node) return node;
    try {
      return json.writeValueToTree(value);
    } catch (IOException e) {
      throw new IllegalStateException("No se pudo serializar " + value.getClass().getSimpleName(), e);
    }
  }

  private void send(Connection connection, Object envelope) {
    var session = connection.session;
    if (!session.isOpen()) return;
    String text;
    try {
      text = json.writeValueAsString(envelope);
    } catch (IOException e) {
      throw new IllegalStateException("No se pudo serializar el mensaje WebSocket", e);
    }
    session.sendAsync(text).whenComplete((ignored, error) -> {
      if (error != null) LOG.debug("Envío WebSocket fallido a {}: {}", connection.id(), error.toString());
    });
  }

  @PreDestroy
  void shutdown() {
    if (heartbeat != null) heartbeat.shutdownNow();
    workers.shutdown();
  }
}

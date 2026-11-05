package es.pokemonuniverse.application.friends;

import es.pokemonuniverse.application.rooms.RoomActivity;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.rooms.RoomOccupancy;
import io.micronaut.context.BeanProvider;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.inject.Singleton;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Presencia de amigos: calcula el estado de una cuenta en el momento ({@code OFFLINE} sin conexiones, {@code ONLINE}
 * fuera de sala, {@code IN_ROOM} en sala, {@code PLAYING} con partida en curso) y avisa a sus amigos conectados cuando
 * cambia.
 *
 * <p>Los avisos se recalculan en el ejecutor {@code BLOCKING}, nunca en el hilo que llama (el coordinador lo hace con el
 * lock de la sala tomado). Cada cuenta tiene como mucho una tarea a la vez: un aviso que llega mientras corre la marca
 * como pendiente y la tarea vuelve a calcular al terminar. Así las ráfagas (un {@code room:state} por acción de juego)
 * se agrupan, y dos cálculos de la misma cuenta nunca se cruzan ni envían un estado viejo después de uno nuevo.
 *
 * <p>El último estado conocido solo se guarda para las cuentas conectadas: {@code OFFLINE} es la ausencia de entrada,
 * así la caché no crece con quien se desconecta.
 */
@Singleton
public class FriendPresence implements FriendStatusSource, FriendEvents, RoomActivity {

  private static final Logger LOG = LoggerFactory.getLogger(FriendPresence.class);

  /** Payload de {@code friends:presence}. */
  @Serdeable
  public record PresencePayload(String userId, FriendStatus status) {}

  private final UserConnections connections;
  private final Function<String, List<String>> friendsOf;
  private final Function<String, RoomOccupancy> occupancyOf;
  private final Executor executor;

  /** Último estado enviado por cuenta; sin entrada, {@code OFFLINE}. Solo lo toca la tarea de esa cuenta. */
  private final Map<String, FriendStatus> lastStatus = new ConcurrentHashMap<>();
  /** Cuentas con tarea en marcha → si llegó otro aviso mientras tanto. Protegido por {@code this}. */
  private final Map<String, Boolean> running = new HashMap<>();

  /**
   * {@code FriendService} y {@code RoomCoordinator} dependen de la presencia (puertos de estado, avisos y actividad), así
   * que se resuelven al usarlos. Sin {@code FriendService} (sin BD) nadie tiene amigos.
   */
  @Inject
  public FriendPresence(UserConnections connections, BeanProvider<FriendService> friends,
      BeanProvider<RoomCoordinator> rooms, @Named(TaskExecutors.BLOCKING) ExecutorService executor) {
    this(connections, userId -> friends.isPresent() ? friends.get().acceptedFriendIds(userId) : List.of(),
        userId -> rooms.get().occupancyOf(userId), executor);
  }

  FriendPresence(UserConnections connections, Function<String, List<String>> friendsOf,
      Function<String, RoomOccupancy> occupancyOf, Executor executor) {
    this.connections = connections;
    this.friendsOf = friendsOf;
    this.occupancyOf = occupancyOf;
    this.executor = executor;
  }

  @Override
  public FriendStatus statusOf(String userId) {
    if (!connections.isOnline(userId)) return FriendStatus.OFFLINE;
    return switch (occupancyOf.apply(userId)) {
      case NONE -> FriendStatus.ONLINE;
      case IN_ROOM -> FriendStatus.IN_ROOM;
      case PLAYING -> FriendStatus.PLAYING;
    };
  }

  /** La amistad o la solicitud entre los dos cambió: cada uno vuelve a pedir su lista. */
  @Override
  public void changed(String a, String b) {
    connections.send(a, "friends:changed", Map.of());
    connections.send(b, "friends:changed", Map.of());
  }

  /** Solo encola: se llama con el lock de una sala tomado. */
  @Override
  public void changed(Collection<String> userIds) {
    for (var userId : userIds) schedule(userId);
  }

  public void connectionOpened(String userId) {
    schedule(userId);
  }

  public void connectionClosed(String userId) {
    schedule(userId);
  }

  /** Cuentas con estado en caché (solo las conectadas); para las pruebas. */
  int trackedUsers() {
    return lastStatus.size();
  }

  private void schedule(String userId) {
    synchronized (this) {
      if (running.containsKey(userId)) {
        running.put(userId, true);
        return;
      }
      running.put(userId, false);
    }
    try {
      executor.execute(() -> drain(userId));
    } catch (RejectedExecutionException error) {
      // Cierre del servidor: el ejecutor ya no acepta trabajo.
      synchronized (this) {
        running.remove(userId);
      }
    }
  }

  private void drain(String userId) {
    while (true) {
      try {
        refresh(userId);
      } catch (Throwable error) {
        // Throwable, como la cola de WsSessions: si algo escapara, la cuenta quedaría en running y sin avisos.
        LOG.warn("No se pudo actualizar la presencia de {}", userId, error);
      }
      synchronized (this) {
        if (Boolean.TRUE.equals(running.get(userId))) {
          running.put(userId, false);
          continue;
        }
        running.remove(userId);
        return;
      }
    }
  }

  /**
   * Recalcula y, si cambió, avisa a los amigos conectados. La caché se actualiza después de leer los amigos: si la
   * lectura falla, el siguiente aviso vuelve a intentarlo.
   */
  private void refresh(String userId) {
    var status = statusOf(userId);
    if (status == lastStatus.getOrDefault(userId, FriendStatus.OFFLINE)) return;
    var friends = friendsOf.apply(userId);
    if (status == FriendStatus.OFFLINE) lastStatus.remove(userId);
    else lastStatus.put(userId, status);
    var payload = new PresencePayload(userId, status);
    for (var friend : friends) {
      if (connections.isOnline(friend)) connections.send(friend, "friends:presence", payload);
    }
  }
}

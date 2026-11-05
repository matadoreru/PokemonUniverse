package es.pokemonuniverse.application.friends;

import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.rooms.RoomException;
import es.pokemonuniverse.application.rooms.RoomSummary;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.context.BeanProvider;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.BiPredicate;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * {@code room:invite}: invita a un amigo conectado a la sala de quien invita con {@code friends:invite}, en todas sus
 * conexiones. La invitación no se guarda: caduca a los {@value #EXPIRES_MS} ms y, si el amigo no está conectado, no se
 * envía.
 *
 * <p>Orden, para no tener nunca un lock de sala y la BD a la vez: primero la amistad (BD, sin lock), después el resumen
 * de la sala ({@link RoomCoordinator#roomOf}, que toma y suelta el lock), la conexión del amigo, los límites y, al
 * final, el envío, ya sin ningún lock.
 *
 * <p>Límites en memoria, por ventanas fijas como {@code WsRateLimiter}: una invitación por pareja cada
 * {@value #PAIR_WINDOW_MS} ms y {@value #HOST_LIMIT} por anfitrión cada {@value #HOST_WINDOW_MS} ms. Solo cuentan las
 * que se envían. Las entradas caducadas se borran al invitar, así los mapas no crecen más que lo invitado en el último
 * minuto.
 */
@Singleton
public class RoomInvitations {

  static final long EXPIRES_MS = 10 * 60_000;
  static final long PAIR_WINDOW_MS = 30_000;
  static final long HOST_WINDOW_MS = 60_000;
  static final int HOST_LIMIT = 10;

  /** Payload de {@code friends:invite}. */
  @Serdeable
  public record InvitePayload(String inviteId, From from, String roomCode, @Nullable String gameName,
      String expiresAt) {

    @Serdeable
    public record From(String id, String username, AvatarRef avatar) {}
  }

  /** Ventana fija del anfitrión: cuándo empezó y cuántas invitaciones lleva. */
  private record HostWindow(long startedAt, int count) {}

  private final UserConnections connections;
  private final BiPredicate<String, String> areFriends;
  private final Function<String, Optional<RoomSummary>> roomOf;
  private final Clock clock;
  private final Supplier<String> ids;

  /** Pareja {@code from → to} → cuándo se envió su última invitación. Protegido por {@code this}. */
  private final Map<String, Long> pairs = new HashMap<>();
  /** Anfitrión → su ventana actual. Protegido por {@code this}. */
  private final Map<String, HostWindow> hosts = new HashMap<>();

  /** Sin {@code FriendService} (sin BD) nadie tiene amigos. */
  @Inject
  public RoomInvitations(UserConnections connections, BeanProvider<FriendService> friends, RoomCoordinator rooms,
      Clock clock) {
    this(connections, (a, b) -> friends.isPresent() && friends.get().areFriends(a, b), rooms::roomOf, clock,
        () -> UUID.randomUUID().toString());
  }

  RoomInvitations(UserConnections connections, BiPredicate<String, String> areFriends,
      Function<String, Optional<RoomSummary>> roomOf, Clock clock, Supplier<String> ids) {
    this.connections = connections;
    this.areFriends = areFriends;
    this.roomOf = roomOf;
    this.clock = clock;
    this.ids = ids;
  }

  /** Invita a {@code userId}; lanza {@link RoomException} con el motivo si no se puede. */
  public void invite(AuthUser from, @Nullable String userId) {
    if (userId == null || userId.equals(from.id()) || !areFriends.test(from.id(), userId)) {
      throw new RoomException("Not a friend");
    }
    var room = roomOf.apply(from.id()).orElseThrow(() -> new RoomException("You are not in a room"));
    if (!connections.isOnline(userId)) throw new RoomException("Friend is offline");
    if (room.memberIds().contains(userId)) throw new RoomException("Already in this room");
    if (!room.seatHolders().contains(userId) && room.seatHolders().size() >= room.maxPlayers()) {
      throw new RoomException("Room is full");
    }
    long now = clock.now();
    reserve(from.id(), userId, now);
    var payload = new InvitePayload(ids.get(), new InvitePayload.From(from.id(), from.displayName(), from.avatar()),
        room.code(), room.gameName(), IsoTimestamps.millis(Instant.ofEpochMilli(now + EXPIRES_MS)));
    connections.send(userId, "friends:invite", payload);
  }

  /**
   * Comprueba y apunta los dos límites de una vez: dos pestañas del mismo anfitrión no pueden colarse entre la
   * comprobación y el apunte. Nada de E/S aquí dentro.
   */
  private synchronized void reserve(String from, String to, long now) {
    pairs.values().removeIf(sentAt -> now - sentAt >= PAIR_WINDOW_MS);
    hosts.values().removeIf(window -> now - window.startedAt() >= HOST_WINDOW_MS);
    var pair = from + '\u0000' + to;
    if (pairs.containsKey(pair)) throw new RoomException("Invitation already sent");
    var window = hosts.get(from);
    if (window != null && window.count() >= HOST_LIMIT) throw new RoomException("Too many invitations");
    pairs.put(pair, now);
    hosts.put(from, window == null ? new HostWindow(now, 1) : new HostWindow(window.startedAt(), window.count() + 1));
  }

  /** Parejas con límite vigente; para las pruebas. */
  synchronized int trackedPairs() {
    return pairs.size();
  }

  /** Anfitriones con ventana vigente; para las pruebas. */
  synchronized int trackedHosts() {
    return hosts.size();
  }
}

package es.pokemonuniverse.application.friends;

import es.pokemonuniverse.adapters.out.persistence.FriendshipEntity;
import es.pokemonuniverse.adapters.out.persistence.FriendshipRepository;
import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.application.auth.AccountLookup;
import es.pokemonuniverse.application.auth.UserIdentityMapper;
import es.pokemonuniverse.application.rooms.UserExperienceReader;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.profile.ProfileVisibility;
import es.pokemonuniverse.domain.progression.Experience;
import io.micronaut.transaction.TransactionOperations;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.sql.SQLException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.hibernate.Session;

/**
 * Reglas de amistad: enviar, aceptar, rechazar o cancelar solicitudes y quitar amigos. Hay una sola fila por pareja
 * (índice único sin orden); rechazar, cancelar o quitar la borra.
 *
 * <p>Cada operación que cambia una fila bloquea antes las dos filas de "User" de la pareja, siempre en orden de id, y
 * después lee la amistad: así dos operaciones sobre la misma pareja (p. ej. dos solicitudes cruzadas, o cancelar
 * mientras el otro acepta) se serializan y los límites no se pueden pasar a la vez. Las transacciones son
 * programáticas para avisar a {@link FriendEvents} solo tras confirmar y para reintentar en una transacción nueva si,
 * aun así, salta el índice único (en Postgres un error deja abortada la transacción en curso).
 */
@Singleton
public class FriendService {

  static final int MAX_FRIENDS = 200;
  static final int MAX_PENDING_SENT = 50;
  private static final String UNIQUE_VIOLATION = "23505";

  /** Orden de la lista: estado (jugando, en sala, conectado, desconectado) y nombre sin distinguir mayúsculas. */
  private static final Comparator<FriendView> LIST_ORDER = Comparator
      .comparingInt((FriendView f) -> f.status().listRank())
      .thenComparing(FriendView::username, String.CASE_INSENSITIVE_ORDER)
      .thenComparing(FriendView::username);

  private final AccountLookup accounts;
  private final UserRepository users;
  private final FriendshipRepository friendships;
  private final UserExperienceReader experience;
  private final FriendStatusSource presence;
  private final FriendEvents events;
  private final TransactionOperations<Session> transactions;
  private final EntityManager entityManager;
  private final Clock clock;

  public FriendService(AccountLookup accounts, UserRepository users, FriendshipRepository friendships,
      UserExperienceReader experience, FriendStatusSource presence, FriendEvents events,
      TransactionOperations<Session> transactions, EntityManager entityManager, Clock clock) {
    this.accounts = accounts;
    this.users = users;
    this.friendships = friendships;
    this.experience = experience;
    this.presence = presence;
    this.events = events;
    this.transactions = transactions;
    this.entityManager = entityManager;
    this.clock = clock;
  }

  /**
   * Amigos con su presencia y nivel, y solicitudes recibidas y enviadas (sin presencia: aún no son amigos). La presencia
   * se lee al terminar la transacción: {@code statusOf} puede esperar el lock de una sala, y quien lo tiene puede estar
   * esperando una conexión del pool para leer la BD; con la conexión tomada, las dos esperas se bloquearían.
   */
  public FriendsOverview overview(String userId) {
    var read = transactions.executeRead(status -> {
      var friends = new ArrayList<FriendView>();
      var incoming = new ArrayList<FriendRequestView>();
      var outgoing = new ArrayList<FriendRequestView>();
      for (var row : friendships.findAllInvolving(userId)) {
        var otherId = otherOf(row, userId);
        // Una cuenta borrada arrastra sus filas en cascada; si se borra entre las dos lecturas, se omite.
        var other = users.findById(otherId).orElse(null);
        if (other == null) continue;
        if (FriendshipEntity.ACCEPTED.equals(row.getStatus())) {
          friends.add(friendView(other));
        } else {
          var request = new FriendRequestView(row.getId(), requestView(other), row.getCreatedAt());
          (row.getAddresseeId().equals(userId) ? incoming : outgoing).add(request);
        }
      }
      incoming.sort(Comparator.comparing(FriendRequestView::createdAt).reversed());
      outgoing.sort(Comparator.comparing(FriendRequestView::createdAt).reversed());
      return new FriendsOverview(List.copyOf(friends), List.copyOf(incoming), List.copyOf(outgoing));
    });
    var friends = new ArrayList<FriendView>();
    for (var friend : read.friends()) friends.add(withPresence(friend));
    friends.sort(LIST_ORDER);
    return new FriendsOverview(List.copyOf(friends), read.incoming(), read.outgoing());
  }

  /**
   * Envía una solicitud por nombre de usuario. Si el otro ya te la había enviado, la acepta. Usuario inexistente, tú
   * mismo, ya amigos o solicitud tuya ya pendiente dan el mismo error, para no revelar qué cuentas existen.
   */
  public SendResult sendRequest(String userId, String username) {
    var target = accounts.findByUsername(username).orElseThrow(FriendRequestException::cannotSend);
    if (target.getId().equals(userId)) throw FriendRequestException.cannotSend();
    var targetId = target.getId();
    Supplier<SendResult> attempt = () -> transactions.executeWrite(status -> send(userId, targetId));
    SendResult result;
    try {
      result = attempt.get();
    } catch (RuntimeException e) {
      if (!isUniqueViolation(e)) throw e;
      // Otra transacción creó la fila de la pareja a la vez: se vuelve a leer y se trata como corresponda.
      result = attempt.get();
    }
    events.changed(userId, targetId);
    // Presencia fuera de la transacción, como en overview.
    return result instanceof SendResult.BecameFriends(var friend)
        ? new SendResult.BecameFriends(withPresence(friend)) : result;
  }

  private SendResult send(String userId, String targetId) {
    var locked = lockPair(userId, targetId);
    var target = locked.get(targetId);
    if (target == null) throw FriendRequestException.cannotSend();
    var existing = friendships.findPair(userId, targetId);
    if (existing.isPresent()) {
      var row = existing.get();
      if (FriendshipEntity.ACCEPTED.equals(row.getStatus()) || row.getRequesterId().equals(userId)) {
        throw FriendRequestException.cannotSend();
      }
      // Solicitud cruzada: la pendiente del otro hacia ti se acepta.
      acceptRow(row, userId, targetId);
      return new SendResult.BecameFriends(friendView(target));
    }
    if (friendships.countAccepted(userId) >= MAX_FRIENDS) {
      throw new FriendRequestException(FriendRequestException.FRIEND_LIMIT);
    }
    if (friendships.countPendingSentBy(userId) >= MAX_PENDING_SENT) {
      throw new FriendRequestException(FriendRequestException.TOO_MANY_PENDING);
    }
    var row = FriendshipEntity.create(UUID.randomUUID().toString(), userId, targetId, now());
    entityManager.persist(row);
    // Se vuelca aquí para que una violación del índice único salte dentro de esta transacción.
    entityManager.flush();
    return new SendResult.Requested(new FriendRequestView(row.getId(), requestView(target), row.getCreatedAt()));
  }

  /** Acepta una solicitud pendiente; solo puede su destinatario. */
  public FriendView accept(String userId, String requestId) {
    var result = transactions.executeWrite(status -> {
      var row = lockedRequest(requestId, userId);
      if (!row.getAddresseeId().equals(userId)) throw new FriendNotFoundException();
      var requester = entityManager.find(UserEntity.class, row.getRequesterId());
      acceptRow(row, userId, row.getRequesterId());
      return friendView(requester);
    });
    events.changed(userId, result.id());
    return withPresence(result);
  }

  /** Borra una solicitud pendiente: la rechaza su destinatario o la cancela quien la envió. */
  public void decline(String userId, String requestId) {
    var otherId = transactions.executeWrite(status -> {
      var row = lockedRequest(requestId, userId);
      friendships.delete(row);
      return otherOf(row, userId);
    });
    events.changed(userId, otherId);
  }

  /** Quita una amistad aceptada; puede cualquiera de los dos. */
  public void remove(String userId, String friendId) {
    transactions.executeWrite(status -> {
      lockPair(userId, friendId);
      var row = friendships.findPair(userId, friendId)
          .filter(f -> FriendshipEntity.ACCEPTED.equals(f.getStatus()))
          .orElseThrow(FriendNotFoundException::new);
      friendships.delete(row);
      return null;
    });
    events.changed(userId, friendId);
  }

  public List<String> acceptedFriendIds(String userId) {
    return friendships.findAllInvolving(userId).stream()
        .filter(f -> FriendshipEntity.ACCEPTED.equals(f.getStatus()))
        .map(f -> otherOf(f, userId))
        .toList();
  }

  public boolean areFriends(String a, String b) {
    return friendships.findPair(a, b).filter(f -> FriendshipEntity.ACCEPTED.equals(f.getStatus())).isPresent();
  }

  /**
   * Lee la solicitud para saber la pareja, bloquea las dos cuentas y la vuelve a leer: tiene que seguir pendiente y
   * {@code userId} ser una de sus dos partes. Si no, 404.
   */
  private FriendshipEntity lockedRequest(String requestId, String userId) {
    var first = friendships.findById(requestId).orElseThrow(FriendNotFoundException::new);
    if (!isPartOf(first, userId)) throw new FriendNotFoundException();
    // Sin desligarla, la segunda lectura devolvería la copia ya cargada en la sesión, no la fila actual.
    entityManager.detach(first);
    lockPair(first.getRequesterId(), first.getAddresseeId());
    return friendships.findById(requestId)
        .filter(f -> FriendshipEntity.PENDING.equals(f.getStatus()) && isPartOf(f, userId))
        .orElseThrow(FriendNotFoundException::new);
  }

  /**
   * Pasa a aceptada si ninguno de los dos llega ya a {@link #MAX_FRIENDS}. {@code actor} es quien acepta (o cruza la
   * solicitud); si el lleno es {@code other}, el mensaje lo dice: los dos ya se pidieron la amistad, no revela nada.
   */
  private void acceptRow(FriendshipEntity row, String actor, String other) {
    if (friendships.countAccepted(actor) >= MAX_FRIENDS) {
      throw new FriendRequestException(FriendRequestException.FRIEND_LIMIT);
    }
    if (friendships.countAccepted(other) >= MAX_FRIENDS) {
      throw new FriendRequestException(FriendRequestException.OTHER_FRIEND_LIMIT);
    }
    row.accept(now());
    friendships.update(row);
  }

  /** Bloquea las dos filas de "User" en orden de id (sin interbloqueos); una cuenta borrada queda como {@code null}. */
  private Map<String, UserEntity> lockPair(String a, String b) {
    var locked = new HashMap<String, UserEntity>();
    var ordered = a.compareTo(b) <= 0 ? List.of(a, b) : List.of(b, a);
    for (var id : ordered) locked.put(id, entityManager.find(UserEntity.class, id, LockModeType.PESSIMISTIC_WRITE));
    return locked;
  }

  /**
   * Vista de amigo dentro de la transacción, todavía sin presencia ({@code OFFLINE}): quien llama la completa con
   * {@link #withPresence} cuando ya no tiene conexión del pool. Sin nivel si su perfil es visible para nadie.
   */
  private FriendView friendView(UserEntity user) {
    // «Perfil visible para: Nadie» oculta el nivel también a los amigos (spec de perfiles).
    var xp = user.getProfileVisibility() == ProfileVisibility.NOBODY ? null : experience.xpOf(user.getId());
    return new FriendView(user.getId(), user.getUsername(), avatarOf(user),
        xp == null ? null : Experience.levelFor(xp), FriendStatus.OFFLINE);
  }

  /** Nunca dentro de una transacción (ver {@link #overview}). */
  private FriendView withPresence(FriendView friend) {
    return new FriendView(friend.id(), friend.username(), friend.avatar(), friend.level(),
        presence.statusOf(friend.id()));
  }

  /** En una solicitud no se muestra ni el nivel ni la presencia de quien aún no es amigo. */
  private static FriendView requestView(UserEntity user) {
    return new FriendView(user.getId(), user.getUsername(), avatarOf(user), null, FriendStatus.OFFLINE);
  }

  private static AvatarRef avatarOf(UserEntity user) {
    return UserIdentityMapper.avatarFromUser(user.getAvatarType(), user.getAvatarValue(), user.getAvatarVersion());
  }

  private static boolean isPartOf(FriendshipEntity row, String userId) {
    return row.getRequesterId().equals(userId) || row.getAddresseeId().equals(userId);
  }

  private static String otherOf(FriendshipEntity row, String userId) {
    return row.getRequesterId().equals(userId) ? row.getAddresseeId() : row.getRequesterId();
  }

  private static boolean isUniqueViolation(Throwable error) {
    for (Throwable t = error; t != null; t = t.getCause()) {
      if (t instanceof SQLException sql && UNIQUE_VIOLATION.equals(sql.getSQLState())) return true;
      if (t.getCause() == t) break;
    }
    return false;
  }

  /** Las columnas son {@code timestamp(3)}: se trunca a milisegundos. */
  private Instant now() {
    return clock.instant().truncatedTo(ChronoUnit.MILLIS);
  }
}

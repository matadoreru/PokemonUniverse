package es.pokemonuniverse.application.friends;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.FriendshipEntity;
import es.pokemonuniverse.adapters.out.persistence.FriendshipRepository;
import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.transaction.TransactionOperations;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.hibernate.Session;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Reglas de amistad contra Postgres real, con presencia y avisos falsos. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "FriendServiceTest")
class FriendServiceTest {

  /** Avisos recibidos, cada uno como la pareja sin orden. */
  static final class RecordingEvents implements FriendEvents {
    final List<Set<String>> pairs = Collections.synchronizedList(new ArrayList<>());

    @Override
    public void changed(String a, String b) {
      pairs.add(Set.of(a, b));
    }
  }

  /**
   * Presencia que fija cada test; quien no está en el mapa sale desconectado. Anota cada consulta hecha con una
   * transacción o una conexión abiertas: la presencia real puede esperar el lock de una sala y no debe hacerlo con una
   * conexión del pool tomada.
   */
  static final class FakeStatus implements FriendStatusSource {
    final Map<String, FriendStatus> statuses = new ConcurrentHashMap<>();
    final List<String> calls = Collections.synchronizedList(new ArrayList<>());
    final List<String> callsInTransaction = Collections.synchronizedList(new ArrayList<>());
    private final TransactionOperations<Session> transactions;

    FakeStatus(TransactionOperations<Session> transactions) {
      this.transactions = transactions;
    }

    @Override
    public FriendStatus statusOf(String userId) {
      calls.add(userId);
      if (transactions.findTransactionStatus().isPresent() || transactions.hasConnection()) {
        callsInTransaction.add(userId);
      }
      return statuses.getOrDefault(userId, FriendStatus.OFFLINE);
    }
  }

  @Factory
  @Requires(property = "spec.name", value = "FriendServiceTest")
  static class Fakes {
    @Singleton
    @Replaces(FriendEvents.class)
    RecordingEvents events() {
      return new RecordingEvents();
    }

    @Singleton
    @Replaces(FriendStatusSource.class)
    FakeStatus status(TransactionOperations<Session> transactions) {
      return new FakeStatus(transactions);
    }
  }

  @Inject FriendService service;
  @Inject FriendshipRepository friendships;
  @Inject UserRepository users;
  @Inject RecordingEvents events;
  @Inject FakeStatus status;

  private final List<String> created = new ArrayList<>();

  private record User(String id, String username) {}

  @BeforeEach
  void reset() {
    events.pairs.clear();
    status.statuses.clear();
    status.calls.clear();
    status.callsInTransaction.clear();
  }

  @AfterEach
  void cleanUp() {
    created.forEach(id -> {
      if (users.existsById(id)) users.deleteById(id);
    });
    created.clear();
  }

  private User user(String username) {
    var id = UUID.randomUUID().toString();
    users.save(UserEntity.create(id, username, id + "@mail.com", "h", Instant.now().truncatedTo(ChronoUnit.MILLIS)));
    created.add(id);
    return new User(id, username);
  }

  private User user() {
    return user("am_" + UUID.randomUUID().toString().substring(0, 10));
  }

  private void row(String from, String to, boolean accepted) {
    var now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    var f = FriendshipEntity.create(UUID.randomUUID().toString(), from, to, now);
    if (accepted) f.accept(now);
    friendships.save(f);
  }

  private static String requestId(SendResult result) {
    return assertInstanceOf(SendResult.Requested.class, result).request().id();
  }

  private static void assertCannotSend(String message, Runnable action) {
    var e = assertThrows(FriendRequestException.class, action::run);
    assertEquals(message, e.getMessage());
  }

  @Test
  void requestThenAccept() {
    var a = user();
    var b = user();
    var sent = assertInstanceOf(SendResult.Requested.class, service.sendRequest(a.id(), b.username()));
    assertEquals(b.id(), sent.request().user().id());
    assertEquals(List.of(Set.of(a.id(), b.id())), events.pairs);

    var mineA = service.overview(a.id());
    assertEquals(List.of(sent.request().id()), mineA.outgoing().stream().map(FriendRequestView::id).toList());
    var mineB = service.overview(b.id());
    assertEquals(List.of(a.id()), mineB.incoming().stream().map(r -> r.user().id()).toList());

    var friend = service.accept(b.id(), sent.request().id());
    assertEquals(a.id(), friend.id());
    assertEquals(1, friend.level(), "una cuenta sin experiencia es nivel 1");
    assertEquals(List.of(Set.of(a.id(), b.id()), Set.of(a.id(), b.id())), events.pairs);

    for (var pair : List.of(List.of(a, b), List.of(b, a))) {
      var overview = service.overview(pair.get(0).id());
      assertEquals(List.of(pair.get(1).id()), overview.friends().stream().map(FriendView::id).toList());
      assertTrue(overview.incoming().isEmpty());
      assertTrue(overview.outgoing().isEmpty());
    }
    assertTrue(service.areFriends(a.id(), b.id()));
    assertEquals(List.of(b.id()), service.acceptedFriendIds(a.id()));
  }

  @Test
  void sameErrorForUnknownSelfAlreadyFriendsAndDuplicate() {
    var a = user();
    var b = user();
    var c = user();
    row(a.id(), b.id(), true);
    service.sendRequest(a.id(), c.username());
    events.pairs.clear();
    var generic = FriendRequestException.CANNOT_SEND;
    assertCannotSend(generic, () -> service.sendRequest(a.id(), "nadie_" + UUID.randomUUID()));
    assertCannotSend(generic, () -> service.sendRequest(a.id(), a.username()));
    assertCannotSend(generic, () -> service.sendRequest(a.id(), b.username()));
    assertCannotSend(generic, () -> service.sendRequest(b.id(), a.username()));
    assertCannotSend(generic, () -> service.sendRequest(a.id(), c.username()));
    assertTrue(events.pairs.isEmpty(), "un rechazo no avisa");
  }

  @Test
  void crossedRequestBecomesFriends() {
    var a = user();
    var b = user();
    service.sendRequest(a.id(), b.username());
    var result = assertInstanceOf(SendResult.BecameFriends.class, service.sendRequest(b.id(), a.username()));
    assertEquals(a.id(), result.friend().id());
    var row = friendships.findPair(a.id(), b.id()).orElseThrow();
    assertEquals(FriendshipEntity.ACCEPTED, row.getStatus());
    assertEquals(a.id(), row.getRequesterId());
  }

  @Test
  void concurrentCrossedRequestsEndAsOneAcceptedRow() throws Exception {
    var pool = Executors.newFixedThreadPool(2);
    try {
      for (int round = 0; round < 10; round++) {
        var a = user();
        var b = user();
        var barrier = new CyclicBarrier(2);
        Future<SendResult> fromA = pool.submit(() -> {
          barrier.await(10, TimeUnit.SECONDS);
          return service.sendRequest(a.id(), b.username());
        });
        Future<SendResult> fromB = pool.submit(() -> {
          barrier.await(10, TimeUnit.SECONDS);
          return service.sendRequest(b.id(), a.username());
        });
        // get() relanza cualquier excepción del hilo: solo valen los dos resultados correctos.
        var results = List.of(fromA.get(20, TimeUnit.SECONDS), fromB.get(20, TimeUnit.SECONDS));
        assertEquals(1, results.stream().filter(SendResult.Requested.class::isInstance).count(), results.toString());
        assertEquals(1, results.stream().filter(SendResult.BecameFriends.class::isInstance).count(), results.toString());
        var rows = friendships.findAllInvolving(a.id());
        assertEquals(1, rows.size());
        assertEquals(FriendshipEntity.ACCEPTED, rows.getFirst().getStatus());
      }
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void usernameLookupIgnoresCaseWhenUnique() {
    var a = user();
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var unique = user("Unico_" + tag);
    var result = service.sendRequest(a.id(), "unico_" + tag.toUpperCase());
    assertEquals(unique.id(), assertInstanceOf(SendResult.Requested.class, result).request().user().id());

    var tag2 = UUID.randomUUID().toString().substring(0, 8);
    user("Doble_" + tag2);
    var exact = user("doble_" + tag2);
    assertCannotSend(FriendRequestException.CANNOT_SEND, () -> service.sendRequest(a.id(), "DOBLE_" + tag2));
    var byExact = service.sendRequest(a.id(), "doble_" + tag2);
    assertEquals(exact.id(), assertInstanceOf(SendResult.Requested.class, byExact).request().user().id());
  }

  @Test
  void onlyAddresseeAccepts() {
    var a = user();
    var b = user();
    var id = requestId(service.sendRequest(a.id(), b.username()));
    assertThrows(FriendNotFoundException.class, () -> service.accept(a.id(), id));
    assertEquals(FriendshipEntity.PENDING, friendships.findById(id).orElseThrow().getStatus());
    service.accept(b.id(), id);
    assertThrows(FriendNotFoundException.class, () -> service.accept(b.id(), id), "ya aceptada");
  }

  @Test
  void requesterCancelsAddresseeDeclines() {
    var a = user();
    var b = user();
    var first = requestId(service.sendRequest(a.id(), b.username()));
    events.pairs.clear();
    service.decline(a.id(), first);
    assertTrue(friendships.findById(first).isEmpty(), "cancelada por quien la envió");
    var second = requestId(service.sendRequest(a.id(), b.username()));
    service.decline(b.id(), second);
    assertTrue(friendships.findById(second).isEmpty(), "rechazada por el destinatario");
    assertEquals(List.of(Set.of(a.id(), b.id()), Set.of(a.id(), b.id()), Set.of(a.id(), b.id())), events.pairs);
  }

  @Test
  void strangerGets404() {
    var a = user();
    var b = user();
    var c = user();
    var id = requestId(service.sendRequest(a.id(), b.username()));
    var e = assertThrows(FriendNotFoundException.class, () -> service.accept(c.id(), id));
    assertEquals("Friend request not found", e.getMessage());
    assertThrows(FriendNotFoundException.class, () -> service.decline(c.id(), id));
    assertThrows(FriendNotFoundException.class, () -> service.decline(a.id(), UUID.randomUUID().toString()));
    assertThrows(FriendNotFoundException.class, () -> service.remove(c.id(), a.id()));
    assertThrows(FriendNotFoundException.class, () -> service.remove(a.id(), b.id()), "pendiente, no amigos");
    service.accept(b.id(), id);
    assertThrows(FriendNotFoundException.class, () -> service.decline(a.id(), id), "aceptada: se quita, no se cancela");
    assertTrue(friendships.findById(id).isPresent());
  }

  @Test
  void removeWorksFromEitherSide() {
    var a = user();
    var b = user();
    row(a.id(), b.id(), true);
    service.remove(a.id(), b.id());
    assertTrue(friendships.findPair(a.id(), b.id()).isEmpty());
    row(a.id(), b.id(), true);
    service.remove(b.id(), a.id());
    assertTrue(friendships.findPair(a.id(), b.id()).isEmpty());
    assertEquals(List.of(Set.of(a.id(), b.id()), Set.of(a.id(), b.id())), events.pairs);
    assertThrows(FriendNotFoundException.class, () -> service.remove(a.id(), b.id()));
  }

  @Test
  void limits() {
    var full = user();
    for (int i = 0; i < 200; i++) row(full.id(), user().id(), true);
    var target = user();
    assertCannotSend(FriendRequestException.FRIEND_LIMIT, () -> service.sendRequest(full.id(), target.username()));
    // Aceptar tampoco puede pasar de 200, ni del lado de quien acepta ni del de quien pidió; si el lleno es el otro, el
    // mensaje lo dice (solo entre dos que ya se pidieron la amistad: a un desconocido no le revela nada).
    var other = user();
    var toFull = requestId(service.sendRequest(other.id(), full.username()));
    assertCannotSend(FriendRequestException.FRIEND_LIMIT, () -> service.accept(full.id(), toFull));
    // Cruzar la solicitud recibida es aceptarla: el lleno es quien la cruza.
    assertCannotSend(FriendRequestException.FRIEND_LIMIT, () -> service.sendRequest(full.id(), other.username()));
    friendships.deleteById(toFull);
    var fromFull = UUID.randomUUID().toString();
    friendships.save(FriendshipEntity.create(fromFull, full.id(), other.id(), Instant.now()));
    assertCannotSend(FriendRequestException.OTHER_FRIEND_LIMIT, () -> service.accept(other.id(), fromFull));
    assertCannotSend(FriendRequestException.OTHER_FRIEND_LIMIT, () -> service.sendRequest(other.id(), full.username()));

    var sender = user();
    for (int i = 0; i < 50; i++) row(sender.id(), user().id(), false);
    assertCannotSend(FriendRequestException.TOO_MANY_PENDING,
        () -> service.sendRequest(sender.id(), target.username()));
    // Una solicitud cruzada se acepta aunque tenga 50 enviadas: no crea una pendiente más.
    var crossed = user();
    row(crossed.id(), sender.id(), false);
    assertInstanceOf(SendResult.BecameFriends.class, service.sendRequest(sender.id(), crossed.username()));
  }

  @Test
  void overviewOrdersByStatusThenName() {
    var me = user();
    var tag = UUID.randomUUID().toString().substring(0, 6);
    var offB = user("b_off_" + tag);
    var offA = user("A_off_" + tag);
    var online = user("z_on_" + tag);
    var room = user("y_room_" + tag);
    var playing = user("x_play_" + tag);
    var playing2 = user("W_play_" + tag);
    for (var f : List.of(offB, offA, online, room, playing, playing2)) row(f.id(), me.id(), true);
    status.statuses.put(online.id(), FriendStatus.ONLINE);
    status.statuses.put(room.id(), FriendStatus.IN_ROOM);
    status.statuses.put(playing.id(), FriendStatus.PLAYING);
    status.statuses.put(playing2.id(), FriendStatus.PLAYING);
    var friends = service.overview(me.id()).friends();
    assertEquals(List.of(playing2.username(), playing.username(), room.username(), online.username(),
        offA.username(), offB.username()), friends.stream().map(FriendView::username).toList());
    assertEquals(FriendStatus.PLAYING, friends.getFirst().status());
  }

  @Test
  void presenceIsNeverReadInsideATransaction() {
    var me = user();
    var friend = user();
    row(friend.id(), me.id(), true);
    var asker = user();
    var askerRequest = requestId(service.sendRequest(asker.id(), me.username()));
    var crossed = user();
    requestId(service.sendRequest(crossed.id(), me.username()));
    status.statuses.put(friend.id(), FriendStatus.PLAYING);
    status.statuses.put(asker.id(), FriendStatus.IN_ROOM);
    status.statuses.put(crossed.id(), FriendStatus.ONLINE);

    assertEquals(FriendStatus.PLAYING, service.overview(me.id()).friends().getFirst().status());
    assertEquals(FriendStatus.IN_ROOM, service.accept(me.id(), askerRequest).status());
    var became = assertInstanceOf(SendResult.BecameFriends.class, service.sendRequest(me.id(), crossed.username()));
    assertEquals(FriendStatus.ONLINE, became.friend().status());

    assertEquals(Set.of(friend.id(), asker.id(), crossed.id()), Set.copyOf(status.calls));
    assertEquals(List.of(), status.callsInTransaction, "statusOf con una transacción abierta");
  }

  @Test
  void deletedUserDisappearsFromOverview() {
    var me = user();
    var friend = user();
    var asker = user();
    var asked = user();
    row(me.id(), friend.id(), true);
    row(asker.id(), me.id(), false);
    row(me.id(), asked.id(), false);
    for (var gone : List.of(friend, asker, asked)) users.deleteById(gone.id());
    var overview = service.overview(me.id());
    assertTrue(overview.friends().isEmpty());
    assertTrue(overview.incoming().isEmpty());
    assertTrue(overview.outgoing().isEmpty());
    assertTrue(service.acceptedFriendIds(me.id()).isEmpty());
  }
}

package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.data.exceptions.DataAccessException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.persistence.PersistenceException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Repositorio de amistades contra Postgres real. */
@MicronautTest(transactional = false)
class FriendshipRepositoryTest {

  @Inject FriendshipRepository friendships;
  @Inject UserRepository users;

  private final List<String> created = new ArrayList<>();

  private String user() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var id = users.save(UserEntity.create(UUID.randomUUID().toString(), "f_" + tag, tag + "@mail.com", "h",
        Instant.now())).getId();
    created.add(id);
    return id;
  }

  private FriendshipEntity request(String from, String to) {
    return friendships.save(FriendshipEntity.create(UUID.randomUUID().toString(), from, to, Instant.now()));
  }

  /** Fuera de una transacción de Micronaut, Hibernate puede lanzar su propia excepción en lugar de DataAccessException. */
  private static void assertViolation(org.junit.jupiter.api.function.Executable action) {
    var e = assertThrows(RuntimeException.class, action);
    assertTrue(e instanceof DataAccessException || e instanceof PersistenceException, e.getClass().getName());
  }

  @AfterEach
  void cleanUp() {
    created.forEach(id -> users.deleteById(id));
    created.clear();
  }

  @Test
  void pairIsFoundInBothDirections() {
    var a = user();
    var b = user();
    var saved = request(a, b);
    assertEquals("PENDING", saved.getStatus());
    assertEquals(saved.getId(), friendships.findPair(a, b).orElseThrow().getId());
    assertEquals(saved.getId(), friendships.findPair(b, a).orElseThrow().getId());
    assertTrue(friendships.findPair(a, user()).isEmpty());
    assertEquals(1, friendships.findAllInvolving(a).size());
    assertEquals(1, friendships.findAllInvolving(b).size());
  }

  @Test
  void secondRowForSamePairViolatesUniqueIndex() {
    var a = user();
    var b = user();
    request(a, b);
    assertViolation(() -> request(b, a));
  }

  @Test
  void selfFriendshipViolatesCheck() {
    var a = user();
    assertViolation(() -> request(a, a));
  }

  @Test
  void deletingAUserDeletesTheirFriendships() {
    var a = user();
    var b = user();
    request(a, b);
    users.deleteById(a);
    created.remove(a);
    assertTrue(friendships.findPair(a, b).isEmpty());
    assertEquals(0, friendships.findAllInvolving(b).size());
  }

  @Test
  void countsAcceptedAndPendingSent() {
    var a = user();
    var b = user();
    var c = user();
    var d = user();
    var accepted = request(a, b);
    accepted.accept(Instant.now().truncatedTo(ChronoUnit.MILLIS));
    friendships.update(accepted);
    var incoming = request(c, a);
    incoming.accept(Instant.now());
    friendships.update(incoming);
    request(a, d);
    assertEquals(2, friendships.countAccepted(a));
    assertEquals(1, friendships.countPendingSentBy(a));
    assertEquals(0, friendships.countPendingSentBy(b));
    assertEquals(1, friendships.countAccepted(b));
  }
}

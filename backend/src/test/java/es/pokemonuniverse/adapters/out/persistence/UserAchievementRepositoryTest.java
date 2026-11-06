package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.transaction.TransactionOperations;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.hibernate.Session;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Repositorio e inserción idempotente de logros contra Postgres real. */
@MicronautTest(transactional = false)
class UserAchievementRepositoryTest {

  @Inject UserAchievementRepository achievements;
  @Inject UserRepository users;
  @Inject EntityManager em;
  @Inject TransactionOperations<Session> transactions;

  private final List<String> created = new ArrayList<>();

  private String user() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var id = users.save(UserEntity.create(UUID.randomUUID().toString(), "a_" + tag, tag + "@mail.com", "h",
        Instant.now())).getId();
    created.add(id);
    return id;
  }

  private List<String> insert(String userId, List<String> ids) {
    return transactions.executeWrite(status -> UserAchievementInserts.insertMissing(em, userId, ids, Instant.now()));
  }

  @AfterEach
  void cleanUp() {
    created.forEach(id -> users.deleteById(id));
    created.clear();
  }

  @Test
  void insertMissingReturnsOnlyNew() {
    var u = user();
    assertEquals(List.of("a", "b"), insert(u, List.of("a", "b")));
    assertEquals(List.of("c"), insert(u, List.of("b", "c")));
    assertEquals(3, achievements.findByUserId(u).size());
  }

  @Test
  void emptyIdsInsertsNothing() {
    var u = user();
    assertTrue(insert(u, List.of()).isEmpty());
    assertTrue(achievements.findByUserId(u).isEmpty());
  }

  @Test
  void deletingUserDeletesAchievements() {
    var u = user();
    insert(u, List.of("a", "b"));
    users.deleteById(u);
    assertTrue(achievements.findByUserId(u).isEmpty());
  }

  @Test
  void findByUserIdOnlyOwnRows() {
    var u = user();
    var other = user();
    insert(u, List.of("a", "b"));
    insert(other, List.of("z"));
    Set<String> ids = achievements.findByUserId(u).stream().map(UserAchievementEntity::getAchievementId)
        .collect(Collectors.toSet());
    assertEquals(Set.of("a", "b"), ids);
  }
}

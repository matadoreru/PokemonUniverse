package es.pokemonuniverse.application.achievements;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import es.pokemonuniverse.adapters.out.persistence.UserAchievementInserts;
import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.domain.achievements.AchievementCatalog;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.transaction.TransactionOperations;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.hibernate.Session;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Lista de logros por cuenta contra Postgres real. */
@MicronautTest(transactional = false)
class AchievementServiceTest {

  @Inject AchievementService service;
  @Inject AchievementCatalog catalog;
  @Inject UserRepository users;
  @Inject EntityManager em;
  @Inject TransactionOperations<Session> transactions;

  private final List<String> created = new ArrayList<>();

  private String user() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var id = users.save(UserEntity.create(UUID.randomUUID().toString(), "s_" + tag, tag + "@mail.com", "h",
        Instant.now())).getId();
    created.add(id);
    return id;
  }

  private void unlock(String userId, String... ids) {
    transactions.executeWrite(status -> UserAchievementInserts.insertMissing(em, userId, List.of(ids), Instant.now()));
  }

  @AfterEach
  void cleanUp() {
    created.forEach(id -> users.deleteById(id));
    created.clear();
  }

  @Test
  void followsCatalogOrderWithNothingUnlocked() {
    var views = service.listFor(user());
    assertEquals(catalog.all().stream().map(a -> a.id()).toList(), views.stream().map(AchievementView::id).toList());
    views.forEach(v -> assertNull(v.unlockedAt()));
  }

  @Test
  void lockedSecretsAreMasked() {
    var secret = service.listFor(user()).stream().filter(v -> v.id().equals("secret.1")).findFirst().orElseThrow();
    assertEquals("Logro secreto", secret.name());
    assertEquals("Sigue jugando para descubrirlo.", secret.description());
  }

  @Test
  void unlockedSecretShowsRealNameAndDate() {
    var id = user();
    unlock(id, "secret.1", "general.first-game");
    var views = service.listFor(id);
    var secret = views.stream().filter(v -> v.id().equals("secret.1")).findFirst().orElseThrow();
    assertEquals("Foto finish", secret.name());
    assertNotNull(secret.unlockedAt());
    assertNotNull(views.get(0).unlockedAt());
  }

  @Test
  void unknownStoredIdIsIgnored() {
    var id = user();
    unlock(id, "game.removed.win");
    var views = service.listFor(id);
    assertEquals(catalog.all().size(), views.size());
    views.forEach(v -> assertNull(v.unlockedAt()));
  }
}

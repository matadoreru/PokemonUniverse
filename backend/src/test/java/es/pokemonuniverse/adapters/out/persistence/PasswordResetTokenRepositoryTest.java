package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.transaction.TransactionOperations;
import jakarta.inject.Inject;
import java.sql.Connection;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Repositorio de tokens de recuperación contra Postgres real. */
@MicronautTest(transactional = false)
class PasswordResetTokenRepositoryTest {

  @Inject PasswordResetTokenRepository tokens;
  @Inject UserRepository users;
  @Inject TransactionOperations<Connection> transactions;

  private final java.util.List<String> created = new java.util.ArrayList<>();

  private String user() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var id = users.save(UserEntity.create(UUID.randomUUID().toString(), "r_" + tag, tag + "@mail.com", "h",
        Instant.now())).getId();
    created.add(id);
    return id;
  }

  private PasswordResetTokenEntity token(String userId, Instant createdAt) {
    return tokens.save(PasswordResetTokenEntity.create(UUID.randomUUID().toString(), userId,
        UUID.randomUUID().toString(), createdAt.plus(30, ChronoUnit.MINUTES), createdAt));
  }

  @AfterEach
  void cleanUp() {
    created.forEach(id -> users.deleteById(id));
    created.clear();
  }

  @Test
  void savesAndFindsByHash() {
    var owner = user();
    var now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    var saved = token(owner, now);
    Optional<PasswordResetTokenEntity> found =
        transactions.executeWrite(status -> tokens.findByTokenHashForUpdate(saved.getTokenHash()));
    assertTrue(found.isPresent());
    assertEquals(saved.getExpiresAt(), found.get().getExpiresAt());
    assertNull(found.get().getUsedAt());
  }

  @Test
  void invalidateUnusedMarksOnlyThatUsersOpenTokens() {
    var a = user();
    var b = user();
    var now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    var used = token(a, now);
    used.markUsed(now);
    tokens.update(used);
    token(a, now);
    var other = token(b, now);
    assertEquals(1, tokens.invalidateUnused(a, now));
    assertNull(tokens.findById(other.getId()).orElseThrow().getUsedAt());
  }

  @Test
  void deletingTheUserDeletesItsTokens() {
    var owner = user();
    token(owner, Instant.now());
    users.deleteById(owner);
    created.remove(owner);
    assertEquals(0, tokens.findAll().stream().filter(t -> t.getUserId().equals(owner)).count());
  }

  @Test
  void latestCreatedAtIsTheNewest() {
    var owner = user();
    assertEquals(Optional.empty(), tokens.findLatestCreatedAt(owner));
    var now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    token(owner, now.minusSeconds(120));
    token(owner, now);
    assertEquals(Optional.of(now), tokens.findLatestCreatedAt(owner));
  }
}

package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptStore;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptStore.NewPrompt;
import es.pokemonuniverse.domain.content.WouldYouRatherPromptKey;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.sql.SQLException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

/**
 * {@code prisma-repository.integration.test.ts} contra Postgres real (Test Resources), más el reintento de la
 * transacción {@code SERIALIZABLE} y dos ediciones simultáneas de filas distintas que convergen en la misma pareja
 * (sin el lock por usuario del servicio: modela dos procesos escribiendo la tabla).
 */
@MicronautTest(transactional = false)
class JpaWouldYouRatherPromptStoreTest {

  @Inject JpaWouldYouRatherPromptStore store;
  @Inject CustomWouldYouRatherPromptRepository repository;
  @Inject UserRepository users;

  private String user() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    return users.save(UserEntity.create(UUID.randomUUID().toString(), "w_" + tag, tag + "@mail.com", "h", Instant.now()))
        .getId();
  }

  private static Instant now() {
    return Instant.now().truncatedTo(ChronoUnit.MILLIS);
  }

  private static NewPrompt prompt(String optionA, String optionB) {
    return new NewPrompt(UUID.randomUUID().toString(), optionA, optionB, WouldYouRatherPromptKey.of(optionA, optionB));
  }

  private String create(String userId, String optionA, String optionB) {
    return store.createAll(userId, List.of(prompt(optionA, optionB)), now()).getFirst().id();
  }

  /** Lanza las operaciones a la vez en hilos virtuales y devuelve sus resultados (o la excepción). */
  private static List<Object> together(List<Supplier<Object>> operations) throws Exception {
    var start = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var futures = operations.stream().map(op -> executor.submit(() -> {
        start.await();
        try {
          return op.get();
        } catch (RuntimeException e) {
          return e;
        }
      })).toList();
      start.countDown();
      var results = new ArrayList<Object>();
      for (var future : futures) results.add(future.get(30, TimeUnit.SECONDS));
      return results;
    }
  }

  @Test
  void createsReadsAndDeletesOnlyOwnRows() {
    var owner = user();
    var other = user();
    var at = now();
    var created = store.createAll(owner, List.of(prompt("Vivir con Gengar", "Viajar con Magikarp")), at);
    var row = created.getFirst();
    assertEquals(owner, row.userId());
    assertEquals("viajar con magikarp::vivir con gengar", row.normalizedKey());
    assertTrue(row.enabled());
    assertEquals(at, row.createdAt());
    assertTrue(store.findAll().contains(row));
    assertEquals(Optional.empty(), store.update(other, row.id(), null, null, false, now()));
    assertFalse(store.delete(other, row.id()));
    assertTrue(store.delete(owner, row.id()));
    assertFalse(store.delete(owner, row.id()));
  }

  @Test
  void rollsBackTheWholeBatchWhenARowViolatesUniqueness() {
    var userId = user();
    create(userId, "Existing A", "Existing B");
    assertThrows(WouldYouRatherPromptStore.DuplicateException.class, () -> store.createAll(userId,
        List.of(prompt("New A", "New B"), prompt("Existing A", "Existing B")), now()));
    assertEquals(1, store.findAll().stream().filter(p -> p.userId().equals(userId)).count());
  }

  @Test
  void updateMergesWithTheStoredRowAndRecalculatesTheKey() {
    var userId = user();
    var id = create(userId, "First A", "First B");
    var updated = store.update(userId, id, "Updated A", null, false, now()).orElseThrow();
    assertEquals("Updated A", updated.optionA());
    assertEquals("First B", updated.optionB());
    assertEquals(WouldYouRatherPromptKey.of("Updated A", "First B"), updated.normalizedKey());
    assertFalse(updated.enabled());
    var stored = repository.findById(id).orElseThrow();
    assertEquals(WouldYouRatherPromptKey.of("Updated A", "First B"), stored.getNormalizedKey());
    assertThrows(WouldYouRatherPromptStore.SameOptionsException.class,
        () -> store.update(userId, id, null, "updated a!", null, now()));
    assertEquals("First B", repository.findById(id).orElseThrow().getOptionB());
  }

  @Test
  void mergesConcurrentEditsOfTheSameRowAgainstTheCommittedPair() throws Exception {
    var userId = user();
    var id = create(userId, "First A", "First B");
    var results = together(List.of(
        () -> store.update(userId, id, "Updated A", null, null, now()),
        () -> store.update(userId, id, null, "Updated B", null, now())));
    results.forEach(r -> assertTrue(r instanceof Optional<?>, String.valueOf(r)));
    var stored = repository.findById(id).orElseThrow();
    assertEquals("Updated A", stored.getOptionA());
    assertEquals("Updated B", stored.getOptionB());
    assertEquals(WouldYouRatherPromptKey.of("Updated A", "Updated B"), stored.getNormalizedKey());
  }

  @Test
  void rejectsAConcurrentEditThatWouldMakeBothOptionsEqual() throws Exception {
    var userId = user();
    var id = create(userId, "First A", "First B");
    var results = together(List.of(
        () -> store.update(userId, id, "Same choice", null, null, now()),
        () -> store.update(userId, id, null, "Same choice", null, now())));
    assertEquals(1, results.stream().filter(Optional.class::isInstance).count());
    assertEquals(1, results.stream().filter(WouldYouRatherPromptStore.SameOptionsException.class::isInstance).count());
    var stored = repository.findById(id).orElseThrow();
    assertNotEquals(stored.getOptionA(), stored.getOptionB());
    assertEquals(WouldYouRatherPromptKey.of(stored.getOptionA(), stored.getOptionB()), stored.getNormalizedKey());
  }

  @Test
  void concurrentEditsOfTwoRowsConvergingOnOnePairLeaveASingleRow() throws Exception {
    for (int round = 0; round < 5; round++) {
      var userId = user();
      var first = create(userId, "Primera opción", "Segunda opción");
      var second = create(userId, "Tercera opción", "Cuarta opción");
      var results = together(List.of(
          () -> store.update(userId, first, "Vivir con Gengar", "Viajar con Magikarp", null, now()),
          () -> store.update(userId, second, "viajar con magikarp", "VIVIR con Gengar", null, now())));
      assertEquals(1, results.stream().filter(Optional.class::isInstance).count(), results.toString());
      assertEquals(1, results.stream().filter(WouldYouRatherPromptStore.DuplicateException.class::isInstance).count(),
          results.toString());
      assertEquals(1, repository.countByUserIdAndNormalizedKey(userId, "viajar con magikarp::vivir con gengar"));
    }
  }

  // ------------------------------------------------------------------------------------------ reintentos

  private static RuntimeException sqlState(String state) {
    return new RuntimeException("commit", new SQLException("fallo", state));
  }

  @Test
  void retriesSerializationFailuresUpToThreeAttempts() {
    var attempts = new AtomicInteger();
    assertEquals("ok", JpaWouldYouRatherPromptStore.retrying(() -> {
      if (attempts.incrementAndGet() < 3) throw sqlState(attempts.get() == 1 ? "40001" : "40P01");
      return "ok";
    }));
    assertEquals(3, attempts.get());

    attempts.set(0);
    var last = sqlState("40001");
    assertSame(last, assertThrows(RuntimeException.class, () -> JpaWouldYouRatherPromptStore.retrying(() -> {
      attempts.incrementAndGet();
      throw last;
    })));
    assertEquals(3, attempts.get());
  }

  @Test
  void uniqueViolationIsADuplicateWithoutRetrying() {
    var attempts = new AtomicInteger();
    assertThrows(WouldYouRatherPromptStore.DuplicateException.class, () -> JpaWouldYouRatherPromptStore.retrying(() -> {
      attempts.incrementAndGet();
      throw sqlState("23505");
    }));
    assertEquals(1, attempts.get());
    attempts.set(0);
    assertThrows(WouldYouRatherPromptStore.SameOptionsException.class, () -> JpaWouldYouRatherPromptStore.retrying(() -> {
      attempts.incrementAndGet();
      throw new WouldYouRatherPromptStore.SameOptionsException();
    }));
    assertEquals(1, attempts.get());
  }
}

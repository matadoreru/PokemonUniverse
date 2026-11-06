package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.data.exceptions.DataAccessException;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.persistence.PersistenceException;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Repositorios del reto diario contra Postgres real. */
@MicronautTest(transactional = false)
class DailyRepositoriesTest {

  @Inject DailyChallengeRepository challenges;
  @Inject DailyResultRepository results;
  @Inject UserRepository users;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

  private final List<String> createdUsers = new ArrayList<>();
  private final List<LocalDate> createdDates = new ArrayList<>();
  private int dayCounter = 0;

  private String user() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var id = users.save(UserEntity.create(UUID.randomUUID().toString(), "d_" + tag, tag + "@mail.com", "h",
        Instant.now())).getId();
    createdUsers.add(id);
    return id;
  }

  /** Una fecha lejana y distinta por cada llamada, para no chocar con otros tests ni con datos reales. */
  private LocalDate challenge(String gameId) {
    var date = LocalDate.of(2300, 1, 1).plusDays(Math.abs(UUID.randomUUID().getMostSignificantBits() % 100000) + dayCounter++);
    challenges.insertIfAbsent(date, gameId, "[1,2,3]", "abc");
    createdDates.add(date);
    return date;
  }

  private DailyResultEntity start(String userId, LocalDate date, String gameId) {
    return results.save(DailyResultEntity.started(UUID.randomUUID().toString(), userId, date, gameId, Instant.now()));
  }

  private static void assertViolation(org.junit.jupiter.api.function.Executable action) {
    var e = assertThrows(RuntimeException.class, action);
    assertTrue(e instanceof DataAccessException || e instanceof PersistenceException || e.getCause() instanceof SQLException, e.getClass().getName());
  }

  private void exec(String sql) {
    try (Connection c = resolver.resolve(dataSource).getConnection(); var st = c.createStatement()) {
      st.execute(sql);
    } catch (SQLException e) {
      throw new IllegalStateException(e);
    }
  }

  @AfterEach
  void cleanUp() {
    createdUsers.forEach(id -> users.deleteById(id));
    createdUsers.clear();
    createdDates.forEach(d -> exec("DELETE FROM \"DailyChallenge\" WHERE \"date\" = '" + d + "'"));
    createdDates.clear();
  }

  @Test
  void insertIfAbsentKeepsTheFirstList() {
    var date = challenge("higher-lower");
    challenges.insertIfAbsent(date, "shiny-vote", "[9,8]", "other");
    var row = challenges.findById(date).orElseThrow();
    assertEquals("higher-lower", row.getGameId());
    assertEquals("abc", row.getCatalogFingerprint());
    assertEquals(date, row.getDate());
    assertEquals("[1, 2, 3]", row.getPokemonIds());
  }

  @Test
  void uniqueAttemptPerUserAndDate() {
    var date = challenge("higher-lower");
    var u = user();
    start(u, date, "higher-lower");
    assertViolation(() -> start(u, date, "shiny-vote"));
    assertEquals(1, results.findByUserIdAndDate(u, date).stream().count());
  }

  @Test
  void finishAndAbandonOnlyFromStarted() {
    var date = challenge("higher-lower");
    var u = user();
    var r = start(u, date, "higher-lower");
    assertEquals(1, results.finish(r.getId(), 700, 7, "[1,0,1]", Instant.now()));
    assertEquals(0, results.abandon(r.getId(), Instant.now()));
    assertEquals(0, results.finish(r.getId(), 5, 1, "[1]", Instant.now()));
    var row = results.findById(r.getId()).orElseThrow();
    assertEquals("FINISHED", row.getStatus());
    assertEquals(700, row.getScore());
    assertEquals(7, row.getCorrect());
    assertEquals("[1, 0, 1]", row.getRounds());

    var u2 = user();
    var r2 = start(u2, date, "higher-lower");
    assertEquals(1, results.abandon(r2.getId(), Instant.now()));
    assertEquals("ABANDONED", results.findById(r2.getId()).orElseThrow().getStatus());
    assertEquals(0, results.finish(r2.getId(), 1, 1, "[1]", Instant.now()));
    results.deleteStarted(r.getId());
    assertTrue(results.findById(r.getId()).isPresent(), "deleteStarted no toca un resultado terminado");
  }

  @Test
  void deleteStartedRemovesTheAttempt() {
    var date = challenge("shiny-vote");
    var r = start(user(), date, "shiny-vote");
    results.deleteStarted(r.getId());
    assertTrue(results.findById(r.getId()).isEmpty());
  }

  @Test
  void scoreOnlyWhenFinishedCheck() {
    var date = challenge("higher-lower");
    var r = start(user(), date, "higher-lower");
    assertViolation(() -> exec("UPDATE \"DailyResult\" SET score = 5 WHERE id = '" + r.getId() + "'"));
    assertViolation(() -> exec("UPDATE \"DailyResult\" SET status = 'FINISHED' WHERE id = '" + r.getId() + "'"));
    assertViolation(() -> exec("UPDATE \"DailyResult\" SET status = 'OTHER' WHERE id = '" + r.getId() + "'"));
  }

  @Test
  void leaderboardOrderAndRank() {
    var date = challenge("higher-lower");
    var base = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    var a = start(user(), date, "higher-lower");
    var b = start(user(), date, "higher-lower");
    var c = start(user(), date, "higher-lower");
    var d = start(user(), date, "higher-lower");
    start(user(), date, "higher-lower"); // sigue en STARTED: no cuenta
    results.finish(a.getId(), 500, 5, "[1]", base.plusSeconds(5));
    results.finish(b.getId(), 900, 9, "[1]", base.plusSeconds(9));
    results.finish(c.getId(), 500, 5, "[1]", base.plusSeconds(2)); // empata con a, pero terminó antes
    results.abandon(d.getId(), base);

    var top = results.topFinished(date, 10);
    assertEquals(List.of(b.getId(), c.getId(), a.getId()), top.stream().map(DailyResultEntity::getId).toList());
    assertEquals(List.of(b.getId()), results.topFinished(date, 1).stream().map(DailyResultEntity::getId).toList());
    assertEquals(3, results.countFinished(date));
    assertEquals(0, results.countFinishedAbove(date, 900));
    assertEquals(1, results.countFinishedAbove(date, 500));
    assertEquals(3, results.countFinishedAbove(date, 100));
  }

  @Test
  void findFinishedByUserNewestFirst() {
    var u = user();
    var older = challenge("higher-lower");
    var newer = older.plusDays(100001);
    challenges.insertIfAbsent(newer, "shiny-vote", "[1]", "x");
    createdDates.add(newer);
    var r1 = start(u, older, "higher-lower");
    var r2 = start(u, newer, "shiny-vote");
    results.finish(r1.getId(), 1, 1, "[1]", Instant.now());
    results.finish(r2.getId(), 2, 1, "[1]", Instant.now());
    assertEquals(List.of(r2.getId(), r1.getId()),
        results.findFinishedByUser(u, 10).stream().map(DailyResultEntity::getId).toList());
    assertEquals(1, results.findFinishedByUser(u, 1).size());
  }

  @Test
  void deletingUserCascades() {
    var date = challenge("higher-lower");
    var u = user();
    var r = start(u, date, "higher-lower");
    users.deleteById(u);
    createdUsers.remove(u);
    assertTrue(results.findById(r.getId()).isEmpty());
    assertTrue(challenges.findById(date).isPresent());
  }

  @Test
  void unknownGameIdViolatesCheck() {
    var date = challenge("higher-lower");
    assertViolation(() -> challenges.insertIfAbsent(date.plusDays(200000), "nope", "[1]", "x"));
    assertViolation(() -> start(user(), date, "nope"));
  }
}

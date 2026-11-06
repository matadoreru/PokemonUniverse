package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.rooms.GameResultsPersister.ResultRoomSnapshot;
import es.pokemonuniverse.domain.game.GameManifest.MetricDefinition;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.sql.SQLException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** {@code persistGameResults} contra Postgres real (Test Resources). */
@MicronautTest(transactional = false)
class JpaGameResultsPersisterTest {

  @Inject JpaGameResultsPersister persister;
  @Inject RoomHistoryWriter writer;
  @Inject UserRepository users;
  @Inject UserStatsRepository userStats;
  @Inject UserGameStatsRepository userGameStats;
  @Inject GameHistoryRepository games;
  @Inject PlayerGameResultRepository playerResults;
  @Inject javax.sql.DataSource dataSource;
  @Inject io.micronaut.jdbc.DataSourceResolver dataSourceResolver;

  private AuthUser registeredUser() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var user = users.save(UserEntity.create(UUID.randomUUID().toString(), "u_" + tag, tag + "@mail.com", "h",
        Instant.now()));
    return new AuthUser(user.getId(), "Usuario " + tag, AuthUser.Kind.USER, tag + "@mail.com", null,
        new AvatarRef.Default());
  }

  private static AuthUser guest() {
    return new AuthUser("guest_" + UUID.randomUUID(), "Invitado", AuthUser.Kind.GUEST, null, null,
        new AvatarRef.Default());
  }

  private static GameStanding standing(String playerId, int position, int points, Map<String, Number> stats) {
    return new GameStanding(playerId, position, points, null, new LinkedHashMap<>(stats));
  }

  private static ResultRoomSnapshot room(AuthUser... members) {
    var map = new LinkedHashMap<String, AuthUser>();
    for (var member : members) map.put(member.id(), member);
    return new ResultRoomSnapshot(UUID.randomUUID().toString(), "ABCDEF", map);
  }

  private void createRoomHistory(ResultRoomSnapshot room) {
    writer.roomCreated(room.historyId(), room.code(), null, "Host", 8, Instant.now());
  }

  private static final JsonNode CONFIG = JsonNode.createObjectNode(Map.of("rounds", JsonNode.createNumberNode(3)));

  @Test
  void persistsUserAndGuestRowsOnceByResultId() {
    var user = registeredUser();
    var guest = guest();
    var room = room(user, guest);
    createRoomHistory(room);
    var resultId = UUID.randomUUID().toString();
    var results = new GameResults(user.id(), List.of(
        standing(user.id(), 1, 7, Map.of("correct", 3, "incorrect", 1, "sameCorrect", 0, "bestStreak", 2)),
        standing(guest.id(), 2, 4, Map.of("correct", 2, "incorrect", 2, "sameCorrect", 1, "bestStreak", 1))));

    persister.persistNow(room, results, resultId, 1_000, "higher-lower", CONFIG);
    persister.persistNow(room, results, resultId, 1_000, "higher-lower", CONFIG);

    var history = games.findByResultId(resultId).orElseThrow();
    assertEquals(GameHistoryStatus.COMPLETED, history.getStatus());
    assertEquals(room.historyId(), history.getRoomHistoryId());
    assertEquals(2, history.getPlayerCount());
    assertEquals(3, ((Number) history.getConfig().get("rounds")).intValue());
    assertEquals(Instant.ofEpochMilli(1_000), history.getStartedAt());
    var rows = playerResults.findByHistoryId(history.getId());
    assertEquals(2, rows.size());
    var guestRow = rows.stream().filter(row -> row.getDisplayName().equals("Invitado")).findFirst().orElseThrow();
    assertNull(guestRow.getUserId());
    assertEquals(2, guestRow.getPosition());
    assertEquals(4, guestRow.getPoints());
    assertEquals(1, ((Number) guestRow.getMetrics().get("sameCorrect")).intValue());
    var stats = userStats.findById(user.id()).orElseThrow();
    assertEquals(1, stats.getGamesPlayed());
    assertEquals(1, stats.getGamesWon());
    assertEquals(7, stats.getTotalPoints());
    assertTrue(userStats.findById(guest.id()).isEmpty());
    var gameStats = userGameStats.findByUserId(user.id());
    assertEquals(1, gameStats.size());
    assertEquals(Map.of("correct", 3, "incorrect", 1, "sameCorrect", 0, "bestStreak", 2),
        intValues(gameStats.getFirst().getMetrics()));
  }

  @Test
  void awardsExperienceOncePerFinishedGameToRegisteredUsers() {
    var first = registeredUser();
    var second = registeredUser();
    var guest = guest();
    var room = room(first, second, guest);
    createRoomHistory(room);
    var resultId = UUID.randomUUID().toString();
    var results = new GameResults(guest.id(), List.of(standing(guest.id(), 1, 9, Map.of()),
        standing(first.id(), 2, 5, Map.of()), standing(second.id(), 3, 1, Map.of())));

    persister.persistNow(room, results, resultId, 1_000, "higher-lower", CONFIG);
    persister.persistNow(room, results, resultId, 1_000, "higher-lower", CONFIG);
    // 20 por jugar + 20 por quedar segundo / + 10 por tercero; repetir el resultId no suma otra vez.
    assertEquals(40, userStats.findById(first.id()).orElseThrow().getXp());
    assertEquals(30, userStats.findById(second.id()).orElseThrow().getXp());
    assertTrue(userStats.findById(guest.id()).isEmpty());

    // Una partida saltada o abandonada no da experiencia.
    var skipped = UUID.randomUUID().toString();
    writer.gameStarted(skipped, room.historyId(), room.code(), "higher-lower", 3, Map.of(), Instant.now());
    writer.gameAbandoned(skipped, Instant.now());
    assertEquals(40, userStats.findById(first.id()).orElseThrow().getXp());

    var solo = room(first);
    createRoomHistory(solo);
    persister.persistNow(solo, new GameResults(first.id(), List.of(standing(first.id(), 1, 2, Map.of()))),
        UUID.randomUUID().toString(), 2_000, "higher-lower", CONFIG);
    assertEquals(60, userStats.findById(first.id()).orElseThrow().getXp()); // en solitario solo la base
  }

  @Test
  void mergesMetricsWithSumMaxAndMinAcrossGames() {
    var user = registeredUser();
    var room = room(user);
    createRoomHistory(room);
    persister.persistNow(room, new GameResults(user.id(), List.of(standing(user.id(), 1, 5,
        Map.of("correct", 2, "missed", 1, "bestTimeMs", 4_000)))), UUID.randomUUID().toString(), 1_000,
        "whos-that-pokemon", CONFIG);
    persister.persistNow(room, new GameResults(null, List.of(new GameStanding(user.id(), 1, 3, false,
        Map.of("correct", 1, "bestTimeMs", 2_500)))), UUID.randomUUID().toString(), 2_000, "whos-that-pokemon", CONFIG);
    persister.persistNow(room, new GameResults(user.id(), List.of(standing(user.id(), 1, 0,
        Map.of("correct", 0, "bestTimeMs", 0)))), UUID.randomUUID().toString(), 3_000, "whos-that-pokemon", CONFIG);

    var gameStats = userGameStats.findByUserId(user.id()).getFirst();
    assertEquals(3, gameStats.getGamesPlayed());
    assertEquals(2, gameStats.getGamesWon()); // won: false manda sobre winnerId
    assertEquals(8, gameStats.getPoints());
    var metrics = intValues(gameStats.getMetrics());
    assertEquals(3, metrics.get("correct"));
    assertEquals(1, metrics.get("missed"));
    assertEquals(2_500, metrics.get("bestTimeMs"));
    assertEquals(8, metrics.size());
    assertEquals(3, userStats.findById(user.id()).orElseThrow().getGamesPlayed());
  }

  @Test
  void anUnrankedCoopGameGivesXpAndMetricsButIsNotPlayedNorLost() {
    var user = registeredUser();
    var other = registeredUser();
    var room = room(user, other);
    createRoomHistory(room);
    // Una partida clasificatoria de Type Duel primero: 1 jugada, 1 ganada.
    persister.persistNow(room, new GameResults(user.id(), List.of(
        standing(user.id(), 1, 5, Map.of("duelsPlayed", 1, "duelsWon", 1)),
        standing(other.id(), 2, 0, Map.of("duelsPlayed", 1, "duelsWon", 0)))), UUID.randomUUID().toString(), 1_000,
        "type-duel", CONFIG);
    int xpBefore = userStats.findById(user.id()).orElseThrow().getXp();
    // Cooperativo: sin ganador, `ranked: false`.
    var coop = GameResults.unranked(List.of(
        standing(user.id(), 1, 3, Map.of("coopFinds", 3, "coopGamesPlayed", 1, "groupTotal", 4)),
        standing(other.id(), 2, 1, Map.of("coopFinds", 1, "coopGamesPlayed", 1, "groupTotal", 4))));
    persister.persistNow(room, coop, UUID.randomUUID().toString(), 2_000, "type-duel", CONFIG);

    var stats = userStats.findById(user.id()).orElseThrow();
    assertEquals(1, stats.getGamesPlayed());
    assertEquals(1, stats.getGamesWon());
    assertEquals(8, stats.getTotalPoints());
    assertTrue(stats.getXp() > xpBefore, "la partida cooperativa también da experiencia");
    var gameStats = userGameStats.findByUserId(user.id()).getFirst();
    assertEquals(1, gameStats.getGamesPlayed());
    assertEquals(1, gameStats.getGamesWon());
    var metrics = intValues(gameStats.getMetrics());
    assertEquals(1, metrics.get("duelsPlayed"));
    assertEquals(3, metrics.get("coopFinds"));
    assertEquals(1, metrics.get("coopGamesPlayed"));
    // Primera partida del jugador en este juego y cooperativa: la fila nace con 0 jugadas y 0 ganadas.
    var fresh = registeredUser();
    var freshRoom = room(fresh);
    createRoomHistory(freshRoom);
    persister.persistNow(freshRoom, GameResults.unranked(List.of(standing(fresh.id(), 1, 2,
        Map.of("coopFinds", 2, "coopGamesPlayed", 1, "groupTotal", 2)))), UUID.randomUUID().toString(), 3_000,
        "type-duel", CONFIG);
    assertEquals(0, userStats.findById(fresh.id()).orElseThrow().getGamesPlayed());
    var freshGame = userGameStats.findByUserId(fresh.id()).getFirst();
    assertEquals(0, freshGame.getGamesPlayed());
    assertEquals(0, freshGame.getGamesWon());
    assertEquals(2, intValues(freshGame.getMetrics()).get("coopFinds"));
  }

  @Test
  void completesTheAuditedInProgressRowInsteadOfInsertingAnother() {
    var guest = guest();
    var room = room(guest);
    createRoomHistory(room);
    var resultId = UUID.randomUUID().toString();
    writer.gameStarted(resultId, room.historyId(), room.code(), "higher-lower", 1, Map.of("rounds", 3),
        Instant.ofEpochMilli(5_000));
    var started = games.findByResultId(resultId).orElseThrow();
    assertEquals(GameHistoryStatus.IN_PROGRESS, started.getStatus());
    persister.persistNow(room, new GameResults(guest.id(), List.of(standing(guest.id(), 1, 2, Map.of()))), resultId,
        5_000, "higher-lower", CONFIG);
    var completed = games.findByResultId(resultId).orElseThrow();
    assertEquals(started.getId(), completed.getId());
    assertEquals(GameHistoryStatus.COMPLETED, completed.getStatus());
    assertFalse(completed.getEndedAt() == null);
    assertEquals(1, playerResults.findByHistoryId(completed.getId()).size());
  }

  @Test
  void runsSerializableAndRetriesConcurrentFirstGamesOfTheSameUser() throws Exception {
    try (var connection = dataSourceResolver.resolve(dataSource).getConnection()) {
      connection.setAutoCommit(false);
      try (var statement = connection.createStatement()) {
        statement.execute(RoomHistoryWriter.SERIALIZABLE);
        try (var rs = statement.executeQuery("SHOW transaction_isolation")) {
          rs.next();
          assertEquals("serializable", rs.getString(1));
        }
      } finally {
        connection.rollback();
      }
    }
    var user = registeredUser();
    var room = room(user);
    createRoomHistory(room);
    var start = new java.util.concurrent.CountDownLatch(1);
    var tasks = new java.util.ArrayList<java.util.concurrent.Future<?>>();
    try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
      for (int index = 0; index < 2; index++) {
        int points = index + 1;
        tasks.add(pool.submit(() -> {
          start.await();
          persister.persistNow(room, new GameResults(user.id(), List.of(standing(user.id(), 1, points,
              Map.of("correct", points, "bestStreak", points)))), UUID.randomUUID().toString(), 0, "higher-lower",
              CONFIG);
          return null;
        }));
      }
      start.countDown();
      for (var task : tasks) task.get();
    }
    var stats = userStats.findById(user.id()).orElseThrow();
    assertEquals(2, stats.getGamesPlayed());
    assertEquals(3, stats.getTotalPoints());
    var gameStats = userGameStats.findByUserId(user.id());
    assertEquals(1, gameStats.size());
    assertEquals(2, gameStats.getFirst().getGamesPlayed());
    assertEquals(Map.of("correct", 3, "incorrect", 0, "sameCorrect", 0, "bestStreak", 2),
        intValues(gameStats.getFirst().getMetrics()));
  }

  @Test
  void rejectsMissingIdentitiesAndUnknownGames() {
    var guest = guest();
    var room = room(guest);
    var results = new GameResults(null, List.of(standing("ghost", 1, 1, Map.of())));
    assertEquals("Missing result identity: ghost", assertThrows(IllegalStateException.class,
        () -> persister.persistNow(room, results, UUID.randomUUID().toString(), 0, "higher-lower", CONFIG)).getMessage());
    assertEquals("No profile statistics registered for missing", assertThrows(IllegalStateException.class,
        () -> persister.persistNow(room, results, UUID.randomUUID().toString(), 0, "missing", CONFIG)).getMessage());
  }

  @Test
  void mergeMetricsMatchesStatsService() {
    var definitions = List.of(new MetricDefinition("sum", "S", "SUM", null),
        new MetricDefinition("max", "M", "MAX", null), new MetricDefinition("min", "m", "MIN", null));
    assertEquals(Map.of("sum", 3L, "max", 5L, "min", 4L),
        MetricsMerge.merge(Map.of("sum", 1, "max", 5, "min", 0), Map.of("sum", 2, "max", 3, "min", 4), definitions));
    assertEquals(Map.of("sum", 1.5, "max", 2L, "min", 4L),
        MetricsMerge.merge(Map.of("sum", 1, "max", 2, "min", 4), Map.of("sum", 0.5, "min", 0), definitions));
    assertEquals(Map.of("sum", 0L, "max", 0L, "min", 3L),
        MetricsMerge.merge(Map.of("min", "x", "ignored", 9), Map.of("min", 3), definitions));
    assertEquals(Map.of("sum", 0L, "max", 0L, "min", 2L),
        MetricsMerge.merge(Map.of("min", 7), Map.of("min", 2), definitions));
  }

  @Test
  void retriesOnlySerializationDeadlockAndUniqueFailures() {
    assertTrue(JpaGameResultsPersister.isRetryable(new RuntimeException(new SQLException("x", "40001"))));
    assertTrue(JpaGameResultsPersister.isRetryable(new RuntimeException(new SQLException("x", "40P01"))));
    assertTrue(JpaGameResultsPersister.isRetryable(new RuntimeException(new SQLException("x", "23505"))));
    assertFalse(JpaGameResultsPersister.isRetryable(new RuntimeException(new SQLException("x", "23503"))));
    assertFalse(JpaGameResultsPersister.isRetryable(new IllegalStateException("x")));
  }

  private static Map<String, Integer> intValues(Map<String, Object> metrics) {
    var values = new LinkedHashMap<String, Integer>();
    metrics.forEach((key, value) -> values.put(key, ((Number) value).intValue()));
    return values;
  }
}

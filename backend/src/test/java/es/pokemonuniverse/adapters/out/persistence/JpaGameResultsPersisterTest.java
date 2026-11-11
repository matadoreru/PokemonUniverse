package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.achievements.AchievementEvents;
import es.pokemonuniverse.application.achievements.AchievementsUnlocked;
import es.pokemonuniverse.application.achievements.AchievementsUnlocked.AchievementUnlock;
import es.pokemonuniverse.application.rooms.GameResultsPersister.ResultRoomSnapshot;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.GameManifest.MetricDefinition;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.support.MutableClock;
import io.micronaut.context.annotation.Property;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * {@code persistGameResults} contra Postgres real (Test Resources). El reloj va fijo a mediodía UTC para que «Búho
 * nocturno» (fin entre las 03:00 y las 05:00 de Madrid) no dependa de la hora a la que se ejecuta el test.
 */
@MicronautTest(transactional = false)
@Property(name = "test.clock.mutable", value = "true")
class JpaGameResultsPersisterTest {

  private static final Instant NOON = Instant.parse("2026-11-07T12:00:00Z");

  @Inject JpaGameResultsPersister persister;
  @Inject RoomHistoryWriter writer;
  @Inject UserRepository users;
  @Inject UserStatsRepository userStats;
  @Inject UserGameStatsRepository userGameStats;
  @Inject GameHistoryRepository games;
  @Inject PlayerGameResultRepository playerResults;
  @Inject javax.sql.DataSource dataSource;
  @Inject io.micronaut.jdbc.DataSourceResolver dataSourceResolver;
  @Inject GameRegistry registry;
  @Inject JsonMapper json;
  @Inject UserAchievementRepository userAchievements;
  @Inject MutableClock clock;

  @BeforeEach
  void fixClock() {
    clock.set(NOON);
  }

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
    assertEquals(Map.of("correct", 3, "incorrect", 1, "sameCorrect", 0, "bestStreak", 2,
        "endlessBestStreak", 0),
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
  void anUnrankedCoopGameCountsAsPlayedButNeverAsWonAndMarksItselfUnranked() {
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
    // Cooperativo: sin ganador, `ranked: false`; cuenta como jugada, nunca como ganada.
    var coop = GameResults.unranked(List.of(
        standing(user.id(), 1, 3, Map.of("coopFinds", 3, "coopGamesPlayed", 1, "groupTotal", 4)),
        standing(other.id(), 2, 1, Map.of("coopFinds", 1, "coopGamesPlayed", 1, "groupTotal", 4))));
    persister.persistNow(room, coop, UUID.randomUUID().toString(), 2_000, "type-duel", CONFIG);

    var stats = userStats.findById(user.id()).orElseThrow();
    assertEquals(2, stats.getGamesPlayed());
    assertEquals(1, stats.getGamesWon());
    assertEquals(8, stats.getTotalPoints());
    assertTrue(stats.getXp() > xpBefore, "la partida cooperativa también da experiencia");
    var gameStats = userGameStats.findByUserId(user.id()).getFirst();
    assertEquals(2, gameStats.getGamesPlayed());
    assertEquals(1, gameStats.getGamesWon());
    assertEquals(8, gameStats.getPoints());
    var metrics = intValues(gameStats.getMetrics());
    assertEquals(1, metrics.get("duelsPlayed"));
    assertEquals(3, metrics.get("coopFinds"));
    assertEquals(1, metrics.get("coopGamesPlayed"));
    // El porcentaje de victorias descuenta estas partidas: jugadas − sin clasificar = clasificadas.
    assertEquals(1, metrics.get("unrankedGamesPlayed"));
    // Una clasificatoria después no borra la cuenta de partidas sin clasificar.
    persister.persistNow(room, new GameResults(other.id(), List.of(
        standing(user.id(), 2, 0, Map.of("duelsPlayed", 1, "duelsWon", 0)),
        standing(other.id(), 1, 5, Map.of("duelsPlayed", 1, "duelsWon", 1)))), UUID.randomUUID().toString(), 2_500,
        "type-duel", CONFIG);
    var afterRanked = userGameStats.findByUserId(user.id()).getFirst();
    assertEquals(3, afterRanked.getGamesPlayed());
    assertEquals(1, intValues(afterRanked.getMetrics()).get("unrankedGamesPlayed"));
    // Primera partida del jugador en este juego y cooperativa: la fila nace con 1 jugada y 0 ganadas.
    var fresh = registeredUser();
    var freshRoom = room(fresh);
    createRoomHistory(freshRoom);
    persister.persistNow(freshRoom, GameResults.unranked(List.of(standing(fresh.id(), 1, 2,
        Map.of("coopFinds", 2, "coopGamesPlayed", 1, "groupTotal", 2)))), UUID.randomUUID().toString(), 3_000,
        "type-duel", CONFIG);
    var freshTotals = userStats.findById(fresh.id()).orElseThrow();
    assertEquals(1, freshTotals.getGamesPlayed());
    assertEquals(0, freshTotals.getGamesWon());
    assertEquals(2, freshTotals.getTotalPoints());
    var freshGame = userGameStats.findByUserId(fresh.id()).getFirst();
    assertEquals(1, freshGame.getGamesPlayed());
    assertEquals(0, freshGame.getGamesWon());
    assertEquals(2, intValues(freshGame.getMetrics()).get("coopFinds"));
    assertEquals(1, intValues(freshGame.getMetrics()).get("unrankedGamesPlayed"));
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
    assertEquals(Map.of("correct", 3, "incorrect", 0, "sameCorrect", 0, "bestStreak", 2,
        "endlessBestStreak", 0),
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

  /** Un {@link AchievementEvents} falso que anota cada aviso. */
  private record Push(String userId, AchievementsUnlocked payload) {}

  private static final class RecordingEvents implements AchievementEvents {
    final List<Push> pushes = new ArrayList<>();

    @Override
    public void unlocked(String userId, AchievementsUnlocked payload) {
      pushes.add(new Push(userId, payload));
    }
  }

  /** Un {@link RoomHistoryWriter} que falla con {@code 40001} las {@code failures} primeras veces y luego delega. */
  private RoomHistoryWriter failingWriter(int failures, AtomicInteger attempts) {
    return new RoomHistoryWriter(null, null, null) {
      @Override
      public Map<String, AchievementsUnlocked> persistResults(String historyId, String roomCode, GameResults results,
          List<StandingRow> standings, String resultId, Instant startedAt, String gameId, Map<String, Object> config,
          List<MetricDefinition> metrics) {
        if (attempts.incrementAndGet() <= failures) {
          throw new RuntimeException(new SQLException("could not serialize access", "40001"));
        }
        return writer.persistResults(historyId, roomCode, results, standings, resultId, startedAt, gameId, config,
            metrics);
      }
    };
  }

  private static Set<String> ids(Push push) {
    return Set.copyOf(push.payload().achievements().stream().map(AchievementUnlock::id).toList());
  }

  private static GameResults firstGame(AuthUser winner, AuthUser... others) {
    var standings = new ArrayList<GameStanding>();
    standings.add(standing(winner.id(), 1, 5, Map.of()));
    for (int index = 0; index < others.length; index++) {
      standings.add(standing(others[index].id(), index + 2, 1, Map.of()));
    }
    return new GameResults(winner.id(), standings);
  }

  @Test
  void sendsOnePushPerUserAfterCommit() {
    var winner = registeredUser();
    var loser = registeredUser();
    var guest = guest();
    var room = room(winner, loser, guest);
    createRoomHistory(room);
    var events = new RecordingEvents();
    var local = new JpaGameResultsPersister(writer, registry, json, events);

    local.persistNow(room, firstGame(winner, loser, guest), UUID.randomUUID().toString(), 1_000, "higher-lower",
        CONFIG);

    assertEquals(Set.of(winner.id(), loser.id()),
        Set.copyOf(events.pushes.stream().map(Push::userId).toList()));
    assertEquals(2, events.pushes.size());
    var winnerPush = events.pushes.stream().filter(push -> push.userId().equals(winner.id())).findFirst().orElseThrow();
    assertTrue(ids(winnerPush).contains("general.first-win"), () -> "desbloqueados: " + ids(winnerPush));
    var loserPush = events.pushes.stream().filter(push -> push.userId().equals(loser.id())).findFirst().orElseThrow();
    assertEquals(Set.of("general.first-game"), ids(loserPush));
    // Lo avisado ya está confirmado en la base de datos.
    assertEquals(ids(winnerPush).size(), userAchievements.findByUserId(winner.id()).size());
  }

  @Test
  void replayingSameResultIdSendsNothing() {
    var user = registeredUser();
    var room = room(user);
    createRoomHistory(room);
    var resultId = UUID.randomUUID().toString();
    var first = new RecordingEvents();
    new JpaGameResultsPersister(writer, registry, json, first)
        .persistNow(room, firstGame(user), resultId, 1_000, "higher-lower", CONFIG);
    assertEquals(1, first.pushes.size());
    int rows = userAchievements.findByUserId(user.id()).size();

    var replay = new RecordingEvents();
    new JpaGameResultsPersister(writer, registry, json, replay)
        .persistNow(room, firstGame(user), resultId, 1_000, "higher-lower", CONFIG);

    assertTrue(replay.pushes.isEmpty());
    assertEquals(rows, userAchievements.findByUserId(user.id()).size());
  }

  @Test
  void rolledBackAttemptSendsNothing() {
    var user = registeredUser();
    var room = room(user);
    createRoomHistory(room);
    var attempts = new AtomicInteger();
    var events = new RecordingEvents();
    new JpaGameResultsPersister(failingWriter(2, attempts), registry, json, events)
        .persistNow(room, firstGame(user), UUID.randomUUID().toString(), 1_000, "higher-lower", CONFIG);
    assertEquals(3, attempts.get());
    assertEquals(1, events.pushes.size());
    assertEquals(user.id(), events.pushes.getFirst().userId());
    assertTrue(ids(events.pushes.getFirst()).contains("general.first-game"));

    var other = registeredUser();
    var otherRoom = room(other);
    createRoomHistory(otherRoom);
    var exhausted = new AtomicInteger();
    var none = new RecordingEvents();
    var persister = new JpaGameResultsPersister(failingWriter(3, exhausted), registry, json, none);
    assertThrows(RuntimeException.class, () -> persister.persistNow(otherRoom, firstGame(other),
        UUID.randomUUID().toString(), 1_000, "higher-lower", CONFIG));
    assertEquals(JpaGameResultsPersister.MAX_TRANSACTION_ATTEMPTS, exhausted.get());
    assertTrue(none.pushes.isEmpty());
    assertTrue(userAchievements.findByUserId(other.id()).isEmpty());
  }

  @Test
  void pushFailureDoesNotFailPersistence() {
    var first = registeredUser();
    var second = registeredUser();
    var room = room(first, second);
    createRoomHistory(room);
    var resultId = UUID.randomUUID().toString();
    var calls = new AtomicInteger();
    AchievementEvents failing = (userId, payload) -> {
      calls.incrementAndGet();
      throw new IllegalStateException("socket closed");
    };

    new JpaGameResultsPersister(writer, registry, json, failing)
        .persistNow(room, firstGame(first, second), resultId, 1_000, "higher-lower", CONFIG);

    assertEquals(2, calls.get(), "un fallo con una cuenta no corta los avisos de las demás");
    assertEquals(GameHistoryStatus.COMPLETED, games.findByResultId(resultId).orElseThrow().getStatus());
    assertEquals(1, userStats.findById(first.id()).orElseThrow().getGamesPlayed());
    assertFalse(userAchievements.findByUserId(first.id()).isEmpty());
  }

  private static Map<String, Integer> intValues(Map<String, Object> metrics) {
    var values = new LinkedHashMap<String, Integer>();
    metrics.forEach((key, value) -> values.put(key, ((Number) value).intValue()));
    return values;
  }
}

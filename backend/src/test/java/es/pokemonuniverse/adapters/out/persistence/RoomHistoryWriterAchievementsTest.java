package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.achievements.AchievementsUnlocked;
import es.pokemonuniverse.application.achievements.AchievementsUnlocked.AchievementUnlock;
import es.pokemonuniverse.application.achievements.AchievementsUnlocked.PersonalRecord;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.support.MutableClock;
import io.micronaut.context.annotation.Property;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import io.micronaut.jdbc.DataSourceResolver;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Evaluación de logros y récords dentro de la transacción de {@code persistResults}, contra Postgres real. El reloj es
 * fijo (a mediodía UTC) para que «Búho nocturno» no dependa de la hora a la que se ejecuta el test.
 */
@MicronautTest(transactional = false)
@Property(name = "test.clock.mutable", value = "true")
class RoomHistoryWriterAchievementsTest {

  private static final Instant NOON = Instant.parse("2026-11-07T12:00:00Z");

  @Inject RoomHistoryWriter writer;
  @Inject GameRegistry registry;
  @Inject UserRepository users;
  @Inject UserGameStatsRepository userGameStats;
  @Inject UserStatsRepository userStats;
  @Inject MutableClock clock;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver dataSourceResolver;

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

  private static GameStanding standing(AuthUser user, int position, int points, Map<String, Number> stats) {
    return new GameStanding(user.id(), position, points, null, new LinkedHashMap<>(stats));
  }

  /** Partida terminada en una sala nueva; el reloj avanza un minuto para que las partidas tengan orden. */
  private Map<String, AchievementsUnlocked> play(String gameId, Map<String, Object> config, String resultId,
      @io.micronaut.core.annotation.Nullable String winnerId, List<AuthUser> members, List<GameStanding> standings) {
    clock.advance(Duration.ofMinutes(1));
    var historyId = UUID.randomUUID().toString();
    writer.roomCreated(historyId, "ABCDEF", null, "Host", 8, Instant.now());
    var byId = new LinkedHashMap<String, AuthUser>();
    for (var member : members) byId.put(member.id(), member);
    var rows = new ArrayList<RoomHistoryWriter.StandingRow>();
    for (var standing : standings) rows.add(new RoomHistoryWriter.StandingRow(standing, byId.get(standing.playerId())));
    var metrics = registry.get(gameId).orElseThrow().profileStats().metrics();
    return writer.persistResults(historyId, "ABCDEF", new GameResults(winnerId, standings), rows, resultId,
        Instant.now(), gameId, config, metrics);
  }

  private Map<String, AchievementsUnlocked> soloHigherLower(AuthUser user, String mode, int streak) {
    Map<String, Number> stats = "ENDLESS".equals(mode)
        ? Map.of("correct", streak, "bestStreak", streak, "endlessBestStreak", streak)
        : Map.of("correct", streak, "bestStreak", streak);
    return play("higher-lower", Map.of("mode", mode), UUID.randomUUID().toString(), user.id(), List.of(user),
        List.of(standing(user, 1, streak, stats)));
  }

  private static Set<String> ids(Map<String, AchievementsUnlocked> map, AuthUser user) {
    var unlocked = map.get(user.id());
    return unlocked == null ? Set.of()
        : Set.copyOf(unlocked.achievements().stream().map(AchievementUnlock::id).toList());
  }

  private int achievementRows(String userId) throws SQLException {
    try (var connection = dataSourceResolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement(
            "SELECT count(*) FROM \"UserAchievement\" WHERE \"userId\" = ?")) {
      statement.setString(1, userId);
      try (var result = statement.executeQuery()) {
        result.next();
        return result.getInt(1);
      }
    }
  }

  private long endlessBestStreak(AuthUser user) {
    var stats = userGameStats.findByUserId(user.id()).stream().filter(s -> s.getGameId().equals("higher-lower"))
        .findFirst().orElseThrow();
    return ((Number) stats.getMetrics().get("endlessBestStreak")).longValue();
  }

  @Test
  void firstGameUnlocksFirstGameAndGameWin() {
    var winner = registeredUser();
    var loser = registeredUser();
    var unlocked = play("pokemon-trivia", Map.of(), UUID.randomUUID().toString(), winner.id(),
        List.of(winner, loser), List.of(standing(winner, 1, 5, Map.of("correct", 3)),
            standing(loser, 2, 1, Map.of("correct", 1))));

    assertEquals(Set.of("general.first-game", "general.first-win", "game.pokemon-trivia.win"), ids(unlocked, winner));
    assertEquals(Set.of("general.first-game"), ids(unlocked, loser));
    var gameWin = unlocked.get(winner.id()).achievements().stream()
        .filter(a -> a.id().equals("game.pokemon-trivia.win")).findFirst().orElseThrow();
    assertEquals(new AchievementUnlock("game.pokemon-trivia.win", "GAME", "pokemon-trivia", "Gana en Pokémon Trivia",
        "Gana una partida de Pokémon Trivia."), gameWin);
    assertTrue(unlocked.get(winner.id()).records().isEmpty());
  }

  @Test
  void guestGetsNothing() throws SQLException {
    var first = registeredUser();
    var second = registeredUser();
    var guest = guest();
    var unlocked = play("pokemon-trivia", Map.of(), UUID.randomUUID().toString(), guest.id(),
        List.of(guest, first, second), List.of(standing(guest, 1, 9, Map.of()), standing(first, 2, 5, Map.of()),
            standing(second, 3, 1, Map.of())));

    assertEquals(Set.of(first.id(), second.id()), unlocked.keySet());
    assertEquals(0, achievementRows(guest.id()));
  }

  @Test
  void secondGameReturnsOnlyNew() throws SQLException {
    var user = registeredUser();
    var other = registeredUser();
    var players = List.of(user, other);
    play("pokemon-trivia", Map.of(), UUID.randomUUID().toString(), other.id(), players,
        List.of(standing(other, 1, 5, Map.of()), standing(user, 2, 1, Map.of())));
    var second = play("pokemon-trivia", Map.of(), UUID.randomUUID().toString(), user.id(), players,
        List.of(standing(user, 1, 5, Map.of()), standing(other, 2, 1, Map.of())));

    assertEquals(Set.of("general.first-win", "game.pokemon-trivia.win"), ids(second, user));
    assertFalse(second.containsKey(other.id()), "sin nada nuevo no hay entrada");
    assertEquals(3, achievementRows(user.id()));
  }

  @Test
  void completedResultIdReturnsEmpty() {
    var user = registeredUser();
    var resultId = UUID.randomUUID().toString();
    var standings = List.of(standing(user, 1, 5, Map.of()));
    var first = play("pokemon-trivia", Map.of(), resultId, user.id(), List.of(user), standings);
    assertFalse(first.isEmpty());

    assertEquals(Map.of(), play("pokemon-trivia", Map.of(), resultId, user.id(), List.of(user), standings));
  }

  @Test
  void retroactiveMilestones() throws SQLException {
    var user = registeredUser();
    try (var connection = dataSourceResolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement("INSERT INTO \"UserStats\" (\"userId\", \"gamesPlayed\", "
            + "\"gamesWon\", \"totalPoints\", \"xp\") VALUES (?, 50, 0, 0, 0)")) {
      statement.setString(1, user.id());
      statement.executeUpdate();
    }
    var other = registeredUser();
    var unlocked = play("pokemon-trivia", Map.of(), UUID.randomUUID().toString(), other.id(), List.of(user, other),
        List.of(standing(other, 1, 5, Map.of()), standing(user, 2, 1, Map.of())));

    assertTrue(ids(unlocked, user).containsAll(Set.of("general.first-game", "general.games-10", "general.games-50")),
        () -> "desbloqueados: " + ids(unlocked, user));
    assertFalse(ids(unlocked, user).contains("general.games-100"));
  }

  @Test
  void endlessRecordOnlyRises() {
    var user = registeredUser();

    var first = soloHigherLower(user, "ENDLESS", 5);
    assertEquals(List.of(new PersonalRecord("higher-lower", "endlessBestStreak", "Récord en Racha infinita", 5, 0)),
        first.get(user.id()).records());

    var lower = soloHigherLower(user, "ENDLESS", 3);
    assertTrue(lower.get(user.id()) == null || lower.get(user.id()).records().isEmpty());
    assertEquals(5, endlessBestStreak(user));

    var classic = soloHigherLower(user, "CLASSIC", 8);
    assertTrue(classic.get(user.id()) == null || classic.get(user.id()).records().isEmpty());
    assertEquals(5, endlessBestStreak(user));
  }

  @Test
  void endlessRecordRisesTwice() {
    var user = registeredUser();
    soloHigherLower(user, "ENDLESS", 5);

    var higher = soloHigherLower(user, "ENDLESS", 8);
    assertEquals(List.of(new PersonalRecord("higher-lower", "endlessBestStreak", "Récord en Racha infinita", 8, 5)),
        higher.get(user.id()).records());
    assertEquals(8, endlessBestStreak(user));
  }

  private void soloTrivia(AuthUser user) {
    play("pokemon-trivia", Map.of(), UUID.randomUUID().toString(), user.id(), List.of(user),
        List.of(standing(user, 1, 1, Map.of())));
  }

  @Test
  void sameGameStreakCountsConsecutiveGamesOfOneGame() {
    var user = registeredUser();
    soloHigherLower(user, "CLASSIC", 1);
    var stats = userStats.findById(user.id()).orElseThrow();
    assertEquals("higher-lower", stats.getLastGameId());
    assertEquals(1, stats.getSameGameStreak());

    soloHigherLower(user, "ENDLESS", 1);
    assertEquals(2, userStats.findById(user.id()).orElseThrow().getSameGameStreak());

    soloTrivia(user);
    stats = userStats.findById(user.id()).orElseThrow();
    assertEquals("pokemon-trivia", stats.getLastGameId());
    assertEquals(1, stats.getSameGameStreak());
  }

  @Test
  void sameGameStreakCountsUnrankedGamesAndSkipsGuests() {
    var user = registeredUser();
    var guest = guest();
    for (int game = 0; game < 2; game += 1) {
      clock.advance(Duration.ofMinutes(1));
      var historyId = UUID.randomUUID().toString();
      writer.roomCreated(historyId, "ABCDEF", null, "Host", 8, Instant.now());
      var standings = List.of(standing(user, 1, 3, Map.of("groupTotal", 4)), standing(guest, 2, 1, Map.of()));
      var rows = List.of(new RoomHistoryWriter.StandingRow(standings.get(0), user),
          new RoomHistoryWriter.StandingRow(standings.get(1), guest));
      writer.persistResults(historyId, "ABCDEF", GameResults.unranked(standings), rows, UUID.randomUUID().toString(),
          Instant.now(), "type-duel", Map.of("mode", "COOP"),
          registry.get("type-duel").orElseThrow().profileStats().metrics());
    }

    assertEquals(2, userStats.findById(user.id()).orElseThrow().getSameGameStreak());
    assertTrue(userStats.findById(guest.id()).isEmpty());
  }

  @Test
  void loyalBrokenByAnotherGame() {
    var user = registeredUser();
    for (int game = 1; game <= 9; game += 1) soloHigherLower(user, "CLASSIC", 1);
    soloTrivia(user);
    assertFalse(ids(soloHigherLower(user, "CLASSIC", 1), user).contains("secret.2"));
  }

  @Test
  void loyalAfterTenSameGame() {
    var user = registeredUser();
    for (int game = 1; game <= 9; game += 1) {
      var unlocked = soloHigherLower(user, "CLASSIC", 1);
      assertFalse(ids(unlocked, user).contains("secret.2"), "partida " + game);
    }
    assertTrue(ids(soloHigherLower(user, "CLASSIC", 1), user).contains("secret.2"));
  }

  @Test
  void nightOwlUsesInjectedClock() {
    var user = registeredUser();
    clock.set(Instant.parse("2026-11-07T02:29:00Z")); // play() avanza un minuto: 02:30 UTC, 03:30 en Madrid
    var unlocked = soloHigherLower(user, "CLASSIC", 1);

    assertTrue(ids(unlocked, user).contains("secret.3"), () -> "desbloqueados: " + ids(unlocked, user));
  }

  @Test
  void noonIsNotNightOwl() {
    var user = registeredUser();
    assertFalse(ids(soloHigherLower(user, "CLASSIC", 1), user).contains("secret.3"));
  }
}

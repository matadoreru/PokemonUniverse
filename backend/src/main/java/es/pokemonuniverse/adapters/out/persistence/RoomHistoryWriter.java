package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.achievements.AchievementsUnlocked;
import es.pokemonuniverse.application.achievements.AchievementsUnlocked.AchievementUnlock;
import es.pokemonuniverse.application.achievements.AchievementsUnlocked.PersonalRecord;
import es.pokemonuniverse.domain.achievements.AchievementCatalog;
import es.pokemonuniverse.domain.achievements.AchievementFacts;
import es.pokemonuniverse.domain.game.GameManifest.MetricDefinition;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.progression.Experience;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.transaction.annotation.Transactional;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Operaciones transaccionales sobre "RoomHistory", "GameHistory", "PlayerGameResult" y las estadísticas de usuario
 * (las llamadas Prisma de {@code admin/audit.ts} y {@code stats/service.ts}). Cada método es una transacción.
 */
@Singleton
public class RoomHistoryWriter {

  /** Clasificación con la identidad del miembro al terminar la partida. */
  public record StandingRow(GameStanding standing, AuthUser identity) {}

  /** Primera sentencia de la transacción de resultados; solo afecta a esa transacción. */
  static final String SERIALIZABLE = "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE";
  /**
   * Métrica genérica por juego: partidas sin clasificación de victorias, para descontarlas del porcentaje. Todo juego
   * que pueda devolver resultados sin clasificar debe declarar {@code unrankedGamesPlayed} (SUM) en los
   * {@code profileStats} de su registry.json; si no, MetricsMerge la descarta y su porcentaje de victorias sale mal.
   */
  static final String UNRANKED_GAMES_PLAYED = "unrankedGamesPlayed";

  /** Récord personal que se avisa: la mejor racha de Higher or Lower en Racha infinita. */
  static final String RECORD_GAME = "higher-lower";
  static final String RECORD_MODE = "ENDLESS";
  static final String RECORD_KEY = "endlessBestStreak";
  static final String RECORD_LABEL = "Récord en Racha infinita";
  /** Partidas completadas que mira «Fiel». */
  static final int RECENT_GAMES = 10;
  /** Juegos de las últimas partidas completadas de la cuenta, la más reciente primero («Fiel» de la spec). */
  static final String RECENT_GAME_IDS = "SELECT h.\"gameId\" FROM \"PlayerGameResult\" p "
      + "JOIN \"GameHistory\" h ON h.id = p.\"historyId\" WHERE p.\"userId\" = ?1 AND h.status = 'COMPLETED' "
      + "ORDER BY h.\"endedAt\" DESC LIMIT " + RECENT_GAMES;

  private final EntityManager entityManager;
  private final AchievementCatalog catalog;
  private final Clock clock;

  public RoomHistoryWriter(EntityManager entityManager, AchievementCatalog catalog, Clock clock) {
    this.entityManager = entityManager;
    this.catalog = catalog;
    this.clock = clock;
  }

  @Transactional
  public void roomCreated(String id, String code, @Nullable String hostUserId, String hostDisplayName, int maxPlayers,
      Instant createdAt) {
    entityManager.persist(RoomHistoryEntity.create(id, code, hostUserId, hostDisplayName, maxPlayers, createdAt,
        Instant.now()));
  }

  /** Abandona la partida en curso (si hay) y cierra la sala si sigue activa. */
  @Transactional
  public void roomClosed(String id, String reason, @Nullable String gameResultId, Instant endedAt) {
    if (gameResultId != null) abandonGame(gameResultId, endedAt);
    entityManager.createQuery("update RoomHistoryEntity r set r.status = :closed, r.closeReason = :reason, "
            + "r.endedAt = :endedAt, r.updatedAt = :now where r.id = :id and r.status = :active")
        .setParameter("closed", RoomHistoryStatus.CLOSED).setParameter("reason", reason)
        .setParameter("endedAt", endedAt).setParameter("now", Instant.now()).setParameter("id", id)
        .setParameter("active", RoomHistoryStatus.ACTIVE).executeUpdate();
  }

  /** {@code upsert} por {@code resultId} sin actualizar una fila existente. */
  @Transactional
  public void gameStarted(String resultId, String roomHistoryId, String roomCode, String gameId, int playerCount,
      Map<String, Object> config, Instant startedAt) {
    if (findGame(resultId) != null) return;
    entityManager.persist(GameHistoryEntity.create(newId(), resultId, roomHistoryId, roomCode, gameId, playerCount,
        config, GameHistoryStatus.IN_PROGRESS, startedAt, null));
  }

  @Transactional
  public void gameAbandoned(String resultId, Instant endedAt) {
    abandonGame(resultId, endedAt);
  }

  private void abandonGame(String resultId, Instant endedAt) {
    entityManager.createQuery("update GameHistoryEntity g set g.status = :abandoned, g.endedAt = :endedAt "
            + "where g.resultId = :resultId and g.status = :inProgress")
        .setParameter("abandoned", GameHistoryStatus.ABANDONED).setParameter("endedAt", endedAt)
        .setParameter("resultId", resultId).setParameter("inProgress", GameHistoryStatus.IN_PROGRESS)
        .executeUpdate();
  }

  /** {@code interruptStaleActivity}: lo que quedó abierto al parar el servidor anterior pasa a INTERRUPTED. */
  @Transactional
  public void interruptStaleActivity(Instant endedAt) {
    entityManager.createQuery("update GameHistoryEntity g set g.status = :interrupted, g.endedAt = :endedAt "
            + "where g.status = :inProgress")
        .setParameter("interrupted", GameHistoryStatus.INTERRUPTED).setParameter("endedAt", endedAt)
        .setParameter("inProgress", GameHistoryStatus.IN_PROGRESS).executeUpdate();
    entityManager.createQuery("update RoomHistoryEntity r set r.status = :interrupted, r.closeReason = :reason, "
            + "r.endedAt = :endedAt, r.updatedAt = :endedAt where r.status = :active")
        .setParameter("interrupted", RoomHistoryStatus.INTERRUPTED).setParameter("reason", "SERVER_STOPPED")
        .setParameter("endedAt", endedAt).setParameter("active", RoomHistoryStatus.ACTIVE).executeUpdate();
  }

  /**
   * Cuerpo de la transacción {@code SERIALIZABLE} de {@code persistGameResults}: idempotente por {@code resultId}
   * (una partida {@code COMPLETED} no se vuelve a contar). El {@code HibernateTransactionManager} de Micronaut no admite
   * {@code isolation} en {@code @Transactional}; {@code SET TRANSACTION} como primera sentencia la fija solo para esta
   * transacción, sin tocar la conexión del pool.
   *
   * <p>Después de las estadísticas de cada jugador registrado evalúa el catálogo de logros e inserta los cumplidos en
   * la misma transacción. Devuelve, por {@code userId}, solo las cuentas con algún logro o récord nuevo; un mapa vacío
   * si la partida ya estaba {@code COMPLETED}. Un intento revertido no deja filas y el reintento lo recalcula todo.
   */
  @Transactional
  public Map<String, AchievementsUnlocked> persistResults(String historyId, String roomCode, GameResults results, List<StandingRow> standings,
      String resultId, Instant startedAt, String gameId, Map<String, Object> config, List<MetricDefinition> metrics) {
    serializable();
    var existing = findGame(resultId);
    if (existing != null && existing.getStatus() == GameHistoryStatus.COMPLETED) return Map.of();
    var now = Instant.now(clock);
    var mode = config.get("mode") instanceof String value ? value : null;
    var unlocked = new LinkedHashMap<String, AchievementsUnlocked>();
    GameHistoryEntity history;
    if (existing != null) {
      existing.complete(now);
      history = existing;
    } else {
      history = GameHistoryEntity.create(newId(), resultId, historyId, roomCode, gameId, standings.size(), config,
          GameHistoryStatus.COMPLETED, startedAt, now);
      entityManager.persist(history);
    }
    for (var row : standings) {
      var standing = row.standing();
      var userId = row.identity().kind() == AuthUser.Kind.USER ? row.identity().id() : null;
      entityManager.persist(PlayerGameResultEntity.create(newId(), history.getId(), userId,
          row.identity().displayName(), standing.position(), standing.points(), new LinkedHashMap<>(standing.stats())));
      if (userId == null) continue;
      boolean won = standing.won() != null ? standing.won() : standing.playerId().equals(results.winnerId());
      // Una partida sin clasificación de victorias (cooperativa) cuenta como jugada, nunca como ganada; la métrica
      // `unrankedGamesPlayed` la marca para que el porcentaje de victorias solo cuente las clasificadas.
      boolean ranked = results.isRanked();
      Map<String, ? extends Number> gameMetrics = ranked ? standing.stats() : unrankedMetrics(standing.stats());
      int xp = Experience.xpForGame(standing.position(), standings.size());
      var userStats = entityManager.find(UserStatsEntity.class, userId);
      if (userStats == null) {
        userStats = new UserStatsEntity(userId);
        if (ranked) userStats.addGame(won, standing.points());
        else userStats.addUnrankedGame(standing.points());
        userStats.addXp(xp);
        entityManager.persist(userStats);
      } else {
        if (ranked) userStats.addGame(won, standing.points());
        else userStats.addUnrankedGame(standing.points());
        userStats.addXp(xp);
      }
      var gameStats = entityManager.createQuery("select s from UserGameStatsEntity s where s.userId = :userId "
              + "and s.gameId = :gameId", UserGameStatsEntity.class)
          .setParameter("userId", userId).setParameter("gameId", gameId).getResultStream().findFirst().orElse(null);
      var previousMetrics = gameStats == null ? null : gameStats.getMetrics();
      var merged = MetricsMerge.merge(previousMetrics, gameMetrics, metrics);
      if (gameStats == null) {
        entityManager.persist(UserGameStatsEntity.create(newId(), userId, gameId, 1, ranked && won ? 1 : 0,
            standing.points(), merged));
      } else {
        if (ranked) gameStats.addGame(won, standing.points(), merged);
        else gameStats.addUnrankedGame(standing.points(), merged);
      }
      var news = evaluate(userId, gameId, mode, standing, results, ranked && won, userStats, previousMetrics, merged,
          now);
      if (!news.achievements().isEmpty() || !news.records().isEmpty()) unlocked.put(userId, news);
    }
    entityManager.flush();
    return unlocked;
  }

  /**
   * Logros y récord de un jugador registrado con sus estadísticas ya actualizadas: vuelca la sesión para que las
   * lecturas vean esta partida, evalúa el catálogo e inserta los cumplidos con SQL nativo ({@code ON CONFLICT DO
   * NOTHING}, nunca {@code persist}, para no provocar 23505).
   */
  private AchievementsUnlocked evaluate(String userId, String gameId, @Nullable String mode, GameStanding standing,
      GameResults results, boolean won, UserStatsEntity userStats, @Nullable Map<String, Object> previousMetrics,
      Map<String, Object> mergedMetrics, Instant now) {
    entityManager.flush();
    var winsByGame = new HashMap<String, Integer>();
    entityManager.createQuery("select s from UserGameStatsEntity s where s.userId = :userId",
            UserGameStatsEntity.class)
        .setParameter("userId", userId).getResultList()
        .forEach(stats -> winsByGame.put(stats.getGameId(), stats.getGamesWon()));
    @SuppressWarnings("unchecked")
    List<String> recentGameIds = entityManager.createNativeQuery(RECENT_GAME_IDS).setParameter(1, userId)
        .getResultList();
    var facts = AchievementFacts.of(gameId, mode, standing, results, won, userStats.getGamesPlayed(),
        userStats.getGamesWon(), userStats.getXp(), winsByGame, recentGameIds, now);
    var inserted = UserAchievementInserts.insertMissing(entityManager, userId, catalog.met(facts), now);
    var achievements = inserted.stream()
        .map(id -> AchievementUnlock.of(catalog.byId(id).orElseThrow())).toList();
    return new AchievementsUnlocked(achievements, personalRecords(gameId, mode, previousMetrics, mergedMetrics));
  }

  /** Solo Higher or Lower en {@code ENDLESS}: {@code endlessBestStreak} antes y después de fusionar, si sube. */
  private static List<PersonalRecord> personalRecords(String gameId, @Nullable String mode,
      @Nullable Map<String, Object> previousMetrics, Map<String, Object> mergedMetrics) {
    if (!RECORD_GAME.equals(gameId) || !RECORD_MODE.equals(mode)) return List.of();
    long previous = longMetric(previousMetrics, RECORD_KEY);
    long value = longMetric(mergedMetrics, RECORD_KEY);
    if (value <= previous) return List.of();
    return List.of(new PersonalRecord(RECORD_GAME, RECORD_KEY, RECORD_LABEL, value, previous));
  }

  private static long longMetric(@Nullable Map<String, Object> metrics, String key) {
    return metrics != null && metrics.get(key) instanceof Number number ? number.longValue() : 0;
  }

  /** Estadísticas del motor más {@code unrankedGamesPlayed = 1}; solo para las métricas por juego del usuario. */
  private static Map<String, Number> unrankedMetrics(Map<String, ? extends Number> stats) {
    var withMark = new LinkedHashMap<String, Number>(stats);
    withMark.put(UNRANKED_GAMES_PLAYED, 1);
    return withMark;
  }

  private void serializable() {
    entityManager.createNativeQuery(SERIALIZABLE).executeUpdate();
  }

  private @Nullable GameHistoryEntity findGame(String resultId) {
    return entityManager.createQuery("select g from GameHistoryEntity g where g.resultId = :resultId",
            GameHistoryEntity.class)
        .setParameter("resultId", resultId).getResultStream().findFirst().orElse(null);
  }

  /** Prisma genera {@code cuid()}; cualquier texto único sirve como clave. */
  private static String newId() {
    return UUID.randomUUID().toString();
  }
}

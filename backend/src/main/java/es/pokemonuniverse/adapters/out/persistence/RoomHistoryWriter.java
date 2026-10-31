package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.domain.game.GameManifest.MetricDefinition;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.transaction.annotation.Transactional;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import java.time.Instant;
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

  private final EntityManager entityManager;

  public RoomHistoryWriter(EntityManager entityManager) {
    this.entityManager = entityManager;
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
   */
  @Transactional
  public void persistResults(String historyId, String roomCode, GameResults results, List<StandingRow> standings,
      String resultId, Instant startedAt, String gameId, Map<String, Object> config, List<MetricDefinition> metrics) {
    serializable();
    var existing = findGame(resultId);
    if (existing != null && existing.getStatus() == GameHistoryStatus.COMPLETED) return;
    var now = Instant.now();
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
      var userStats = entityManager.find(UserStatsEntity.class, userId);
      if (userStats == null) {
        userStats = new UserStatsEntity(userId);
        userStats.addGame(won, standing.points());
        entityManager.persist(userStats);
      } else {
        userStats.addGame(won, standing.points());
      }
      var gameStats = entityManager.createQuery("select s from UserGameStatsEntity s where s.userId = :userId "
              + "and s.gameId = :gameId", UserGameStatsEntity.class)
          .setParameter("userId", userId).setParameter("gameId", gameId).getResultStream().findFirst().orElse(null);
      if (gameStats == null) {
        entityManager.persist(UserGameStatsEntity.create(newId(), userId, gameId, 1, won ? 1 : 0, standing.points(),
            MetricsMerge.merge(null, standing.stats(), metrics)));
      } else {
        gameStats.addGame(won, standing.points(), MetricsMerge.merge(gameStats.getMetrics(), standing.stats(), metrics));
      }
    }
    entityManager.flush();
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

package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.admin.AdminGameHistoryItem;
import es.pokemonuniverse.application.admin.AdminRecords;
import es.pokemonuniverse.application.admin.AdminRoomHistoryItem;
import es.pokemonuniverse.application.admin.AdminUserItem;
import es.pokemonuniverse.domain.identity.UserRole;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;

/**
 * {@link AdminRecords} con HQL sobre las entidades de Prisma. La búsqueda usa {@code ilike} de HQL, que en PostgreSQL
 * es {@code ILIKE} con el escape por defecto ({@code \}), igual que la consulta de Prisma: el patrón es
 * {@code '%' + search + '%'} sin escapar comodines. La búsqueda en resultados de partidas es un {@code EXISTS} (un
 * {@code JOIN} duplicaría filas y el total), como el {@code some} de Prisma.
 */
@Singleton
@Requires(beans = DataSource.class)
public class JpaAdminRecords implements AdminRecords {

  private final EntityManager entityManager;

  public JpaAdminRecords(EntityManager entityManager) {
    this.entityManager = entityManager;
  }

  @Override
  @Transactional
  public Optional<UserRole> roleOf(String userId) {
    return entityManager.createQuery("select u.role from UserEntity u where u.id = :id", UserRole.class)
        .setParameter("id", userId)
        .getResultStream()
        .findFirst();
  }

  @Override
  @Transactional
  public long countUsers() {
    return entityManager.createQuery("select count(u) from UserEntity u", Long.class).getSingleResult();
  }

  @Override
  @Transactional
  public long countInterruptedGamesSince(Instant since) {
    return entityManager.createQuery("select count(g) from GameHistoryEntity g where g.status = :status"
            + " and g.startedAt >= :since", Long.class)
        .setParameter("status", GameHistoryStatus.INTERRUPTED)
        .setParameter("since", since)
        .getSingleResult();
  }

  /** {@code where} dinámico: solo los filtros presentes, como los {@code ...spread} del router de Node. */
  private static final class Where {
    private final List<String> clauses = new ArrayList<>();
    private final Map<String, Object> params = new LinkedHashMap<>();

    Where add(String clause, String name, Object value) {
      clauses.add(clause);
      params.put(name, value);
      return this;
    }

    Where search(String search, String clause) {
      if (search.isEmpty()) return this;
      return add(clause, "pattern", "%" + search + "%");
    }

    String sql() {
      return clauses.isEmpty() ? "" : " where " + String.join(" and ", clauses);
    }

    <T> TypedQuery<T> bind(TypedQuery<T> query) {
      params.forEach(query::setParameter);
      return query;
    }
  }

  private static Where roomWhere(String search, @Nullable String status) {
    var where = new Where();
    if (status != null) where.add("r.status = :status", "status", RoomHistoryStatus.valueOf(status));
    return where.search(search, "(r.roomCode ilike :pattern or r.hostDisplayName ilike :pattern)");
  }

  @Override
  @Transactional
  public long countRooms(String search, @Nullable String status) {
    var where = roomWhere(search, status);
    return where.bind(entityManager.createQuery("select count(r) from RoomHistoryEntity r" + where.sql(), Long.class))
        .getSingleResult();
  }

  @Override
  @Transactional
  public List<AdminRoomHistoryItem> rooms(String search, @Nullable String status, int offset, int limit) {
    var where = roomWhere(search, status);
    var rows = where.bind(entityManager.createQuery("select r, (select count(g) from GameHistoryEntity g"
            + " where g.roomHistoryId = r.id) from RoomHistoryEntity r" + where.sql() + " order by r.createdAt desc",
            Object[].class))
        .setFirstResult(offset)
        .setMaxResults(limit)
        .getResultList();
    return rows.stream().map(row -> {
      var room = (RoomHistoryEntity) row[0];
      return new AdminRoomHistoryItem(room.getId(), room.getRoomCode(), room.getHostDisplayName(),
          room.getHostUserId(), room.getMaxPlayers(), room.getStatus().name(), room.getCloseReason(),
          (Long) row[1], IsoTimestamps.millis(room.getCreatedAt()), millisOrNull(room.getEndedAt()));
    }).toList();
  }

  private static Where gameWhere(String search, @Nullable String status, @Nullable String gameId) {
    var where = new Where();
    if (status != null) where.add("g.status = :status", "status", GameHistoryStatus.valueOf(status));
    if (gameId != null && !gameId.isEmpty()) where.add("g.gameId = :gameId", "gameId", gameId);
    return where.search(search, "(g.roomCode ilike :pattern or exists (select 1 from PlayerGameResultEntity x"
        + " where x.historyId = g.id and x.displayName ilike :pattern))");
  }

  @Override
  @Transactional
  public long countGames(String search, @Nullable String status, @Nullable String gameId) {
    var where = gameWhere(search, status, gameId);
    return where.bind(entityManager.createQuery("select count(g) from GameHistoryEntity g" + where.sql(), Long.class))
        .getSingleResult();
  }

  @Override
  @Transactional
  public List<GameRow> games(String search, @Nullable String status, @Nullable String gameId, int offset,
      int limit) {
    var where = gameWhere(search, status, gameId);
    var games = where.bind(entityManager.createQuery("select g from GameHistoryEntity g" + where.sql()
            + " order by g.startedAt desc", GameHistoryEntity.class))
        .setFirstResult(offset)
        .setMaxResults(limit)
        .getResultList();
    if (games.isEmpty()) return List.of();
    var participants = new LinkedHashMap<String, List<AdminGameHistoryItem.Participant>>();
    games.forEach(game -> participants.put(game.getId(), new ArrayList<>()));
    entityManager.createQuery("select x from PlayerGameResultEntity x where x.historyId in :ids"
            + " order by x.position asc", PlayerGameResultEntity.class)
        .setParameter("ids", participants.keySet())
        .getResultList()
        .forEach(result -> participants.get(result.getHistoryId()).add(new AdminGameHistoryItem.Participant(
            result.getDisplayName(), result.getUserId(), result.getPosition(), result.getPoints())));
    return games.stream().map(game -> new GameRow(game.getId(), game.getRoomCode(), game.getGameId(),
        game.getPlayerCount(), game.getStatus().name(), IsoTimestamps.millis(game.getStartedAt()),
        millisOrNull(game.getEndedAt()), List.copyOf(participants.get(game.getId())))).toList();
  }

  private static Where userWhere(String search, @Nullable String role) {
    var where = new Where();
    if (role != null) where.add("u.role = :role", "role", UserRole.valueOf(role));
    return where.search(search, "(u.username ilike :pattern or u.email ilike :pattern)");
  }

  @Override
  @Transactional
  public long countUsers(String search, @Nullable String role) {
    var where = userWhere(search, role);
    return where.bind(entityManager.createQuery("select count(u) from UserEntity u" + where.sql(), Long.class))
        .getSingleResult();
  }

  @Override
  @Transactional
  public List<AdminUserItem> users(String search, @Nullable String role, int offset, int limit) {
    var where = userWhere(search, role);
    var rows = where.bind(entityManager.createQuery("select u, s from UserEntity u left join UserStatsEntity s"
            + " on s.userId = u.id" + where.sql() + " order by u.createdAt desc", Object[].class))
        .setFirstResult(offset)
        .setMaxResults(limit)
        .getResultList();
    return rows.stream().map(row -> {
      var user = (UserEntity) row[0];
      var stats = (UserStatsEntity) row[1];
      return new AdminUserItem(user.getId(), user.getUsername(), user.getEmail(), user.getRole().name(),
          stats == null ? 0 : stats.getGamesPlayed(), stats == null ? 0 : stats.getGamesWon(),
          stats == null ? 0 : stats.getTotalPoints(), IsoTimestamps.millis(user.getCreatedAt()),
          IsoTimestamps.millis(user.getUpdatedAt()));
    }).toList();
  }

  private static @Nullable String millisOrNull(@Nullable Instant instant) {
    return instant == null ? null : IsoTimestamps.millis(instant);
  }
}

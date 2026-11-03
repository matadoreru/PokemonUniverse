package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.domain.feedback.FeedbackReference;
import es.pokemonuniverse.domain.feedback.FeedbackStatus;
import es.pokemonuniverse.domain.feedback.FeedbackType;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import jakarta.transaction.Transactional;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;

/**
 * {@code whereFor} y las operaciones de administración de {@code feedback/prisma-repository.ts}: filtros exactos y
 * búsqueda {@code ILIKE '%search%'} sin escapar comodines (como Prisma) en descripción, autor, juego y sala.
 */
@Singleton
@Requires(beans = DataSource.class)
public class JpaFeedbackSearch {

  /** Filtros de la lista; {@code search} vacío no filtra. */
  public record Filters(@Nullable FeedbackReference reference, @Nullable FeedbackStatus status,
      @Nullable FeedbackType type, String search) {}

  private final EntityManager entityManager;

  public JpaFeedbackSearch(EntityManager entityManager) {
    this.entityManager = entityManager;
  }

  @Transactional
  public List<FeedbackEntity> list(Filters filters, int offset, int limit) {
    return query("select f from FeedbackEntity f", " order by f.createdAt desc", filters, FeedbackEntity.class)
        .setFirstResult(offset)
        .setMaxResults(limit)
        .getResultList();
  }

  @Transactional
  public long count(Filters filters) {
    return query("select count(f) from FeedbackEntity f", "", filters, Long.class).getSingleResult();
  }

  /** {@code updateMany} + {@code findUnique}: vacío si el id no existe. */
  @Transactional
  public Optional<FeedbackEntity> updateStatus(String id, FeedbackStatus status, java.time.Instant now) {
    var entity = entityManager.find(FeedbackEntity.class, id);
    if (entity == null) return Optional.empty();
    entity.changeStatus(status, now);
    entityManager.flush();
    return Optional.of(entity);
  }

  private <T> TypedQuery<T> query(String select, String order, Filters filters, Class<T> type) {
    var clauses = new ArrayList<String>();
    Map<String, Object> params = new LinkedHashMap<>();
    if (filters.reference() != null) {
      clauses.add("f.reference = :reference");
      params.put("reference", filters.reference());
    }
    if (filters.status() != null) {
      clauses.add("f.status = :status");
      params.put("status", filters.status());
    }
    if (filters.type() != null) {
      clauses.add("f.type = :type");
      params.put("type", filters.type());
    }
    if (!filters.search().isEmpty()) {
      clauses.add("(f.description ilike :pattern or f.authorDisplayName ilike :pattern or f.gameId ilike :pattern"
          + " or f.roomCode ilike :pattern)");
      params.put("pattern", "%" + filters.search() + "%");
    }
    var where = clauses.isEmpty() ? "" : " where " + String.join(" and ", clauses);
    var query = entityManager.createQuery(select + where + order, type);
    params.forEach(query::setParameter);
    return query;
  }
}

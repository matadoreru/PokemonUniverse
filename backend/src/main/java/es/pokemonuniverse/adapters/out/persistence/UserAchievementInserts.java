package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/** Alta idempotente de logros. Hay que llamarla dentro de una transacción abierta. */
public final class UserAchievementInserts {

  private static final String INSERT = "INSERT INTO \"UserAchievement\" (\"userId\", \"achievementId\", \"unlockedAt\")"
      + " VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING RETURNING \"achievementId\"";

  private UserAchievementInserts() {}

  /**
   * Una sentencia por id: un duplicado no lanza 23505 y {@code RETURNING} da exactamente los logros nuevos.
   * Devuelve los ids insertados, en el orden recibido.
   */
  public static List<String> insertMissing(EntityManager em, String userId, Collection<String> ids, Instant at) {
    var inserted = new ArrayList<String>();
    for (var id : ids) {
      var rows = em.createNativeQuery(INSERT)
          .setParameter(1, userId)
          .setParameter(2, id)
          .setParameter(3, java.sql.Timestamp.from(at))
          .getResultList();
      for (var row : rows) {
        inserted.add((String) row);
      }
    }
    return inserted;
  }
}

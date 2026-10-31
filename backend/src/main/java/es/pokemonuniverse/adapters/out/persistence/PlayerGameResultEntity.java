package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Mapeo de la tabla "PlayerGameResult": la clasificación de un jugador; {@code userId} nulo para invitados. */
@Entity
@Table(name = "PlayerGameResult")
public class PlayerGameResultEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "historyId")
  private String historyId;

  @Column(name = "userId")
  private String userId;

  @Column(name = "displayName")
  private String displayName;

  @Column(name = "position")
  private int position;

  @Column(name = "points")
  private int points;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "metrics")
  private Map<String, Object> metrics;

  protected PlayerGameResultEntity() {}

  public static PlayerGameResultEntity create(String id, String historyId, String userId, String displayName,
      int position, int points, Map<String, Object> metrics) {
    var result = new PlayerGameResultEntity();
    result.id = id;
    result.historyId = historyId;
    result.userId = userId;
    result.displayName = displayName;
    result.position = position;
    result.points = points;
    result.metrics = metrics;
    return result;
  }

  public String getId() {
    return id;
  }

  public String getHistoryId() {
    return historyId;
  }

  public String getUserId() {
    return userId;
  }

  public String getDisplayName() {
    return displayName;
  }

  public int getPosition() {
    return position;
  }

  public int getPoints() {
    return points;
  }

  public Map<String, Object> getMetrics() {
    return metrics;
  }
}

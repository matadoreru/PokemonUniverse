package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Mapeo de la tabla "UserGameStats" (una fila por usuario y minijuego; unica por (userId, gameId)). */
@Entity
@Table(name = "UserGameStats")
public class UserGameStatsEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "userId")
  private String userId;

  @Column(name = "gameId")
  private String gameId;

  @Column(name = "gamesPlayed")
  private int gamesPlayed;

  @Column(name = "gamesWon")
  private int gamesWon;

  @Column(name = "points")
  private int points;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "metrics")
  private Map<String, Object> metrics;

  protected UserGameStatsEntity() {}

  public static UserGameStatsEntity create(String id, String userId, String gameId, int gamesPlayed, int gamesWon,
      int points, Map<String, Object> metrics) {
    var stats = new UserGameStatsEntity();
    stats.id = id;
    stats.userId = userId;
    stats.gameId = gameId;
    stats.gamesPlayed = gamesPlayed;
    stats.gamesWon = gamesWon;
    stats.points = points;
    stats.metrics = metrics;
    return stats;
  }

  public String getId() {
    return id;
  }

  public String getUserId() {
    return userId;
  }

  public String getGameId() {
    return gameId;
  }

  public int getGamesPlayed() {
    return gamesPlayed;
  }

  public int getGamesWon() {
    return gamesWon;
  }

  public int getPoints() {
    return points;
  }

  public Map<String, Object> getMetrics() {
    return metrics;
  }

  /**
   * Partida sin clasificación de victorias (cooperativa): cuenta como jugada, nunca como ganada; las métricas ya
   * fusionadas llevan {@code unrankedGamesPlayed} para descontarla del porcentaje de victorias.
   */
  public void addUnrankedGame(int gamePoints, Map<String, Object> mergedMetrics) {
    gamesPlayed += 1;
    points += gamePoints;
    metrics = mergedMetrics;
  }

  /** Suma una partida ({@code increment} de Prisma) y sustituye las métricas ya fusionadas. */
  public void addGame(boolean won, int gamePoints, Map<String, Object> mergedMetrics) {
    gamesPlayed += 1;
    gamesWon += won ? 1 : 0;
    points += gamePoints;
    metrics = mergedMetrics;
  }
}

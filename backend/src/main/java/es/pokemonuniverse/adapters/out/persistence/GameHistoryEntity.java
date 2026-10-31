package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Mapeo de la tabla "GameHistory": una fila por instancia de minijuego, única por {@code resultId}. */
@Entity
@Table(name = "GameHistory")
public class GameHistoryEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "resultId")
  private String resultId;

  @Column(name = "roomHistoryId")
  private String roomHistoryId;

  @Column(name = "roomCode")
  private String roomCode;

  @Column(name = "gameId")
  private String gameId;

  @Column(name = "playerCount")
  private int playerCount;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "config")
  private Map<String, Object> config;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "status", columnDefinition = "\"GameHistoryStatus\"")
  private GameHistoryStatus status = GameHistoryStatus.IN_PROGRESS;

  @Column(name = "startedAt")
  private Instant startedAt;

  @Column(name = "endedAt")
  private Instant endedAt;

  protected GameHistoryEntity() {}

  public static GameHistoryEntity create(String id, String resultId, String roomHistoryId, String roomCode,
      String gameId, int playerCount, Map<String, Object> config, GameHistoryStatus status, Instant startedAt,
      Instant endedAt) {
    var game = new GameHistoryEntity();
    game.id = id;
    game.resultId = resultId;
    game.roomHistoryId = roomHistoryId;
    game.roomCode = roomCode;
    game.gameId = gameId;
    game.playerCount = playerCount;
    game.config = config;
    game.status = status;
    game.startedAt = startedAt;
    game.endedAt = endedAt;
    return game;
  }

  /** {@code update({ status: 'COMPLETED', endedAt })}. */
  public void complete(Instant at) {
    status = GameHistoryStatus.COMPLETED;
    endedAt = at;
  }

  public String getId() {
    return id;
  }

  public String getResultId() {
    return resultId;
  }

  public String getRoomHistoryId() {
    return roomHistoryId;
  }

  public String getRoomCode() {
    return roomCode;
  }

  public String getGameId() {
    return gameId;
  }

  public int getPlayerCount() {
    return playerCount;
  }

  public Map<String, Object> getConfig() {
    return config;
  }

  public GameHistoryStatus getStatus() {
    return status;
  }

  public Instant getStartedAt() {
    return startedAt;
  }

  public Instant getEndedAt() {
    return endedAt;
  }
}

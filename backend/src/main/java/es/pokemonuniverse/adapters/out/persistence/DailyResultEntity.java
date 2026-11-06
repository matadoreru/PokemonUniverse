package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import org.hibernate.annotations.ColumnTransformer;

/** Tabla "DailyResult": el único intento de una cuenta en el reto de un día. */
@Entity
@Table(name = "DailyResult")
public class DailyResultEntity {

  public static final String STARTED = "STARTED";
  public static final String FINISHED = "FINISHED";
  public static final String ABANDONED = "ABANDONED";

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "userId")
  private String userId;

  @Column(name = "date")
  private LocalDate date;

  /** Copia del juego del reto, para mostrarlo sin cruzar tablas. */
  @Column(name = "gameId")
  private String gameId;

  /** {@code STARTED}, {@code FINISHED} o {@code ABANDONED} (lo fuerza un CHECK). */
  @Column(name = "status")
  private String status;

  /** Solo en {@code FINISHED}. */
  @Column(name = "score")
  private Integer score;

  /** Solo en {@code FINISHED}. */
  @Column(name = "correct")
  private Integer correct;

  /** Lista de enteros como texto JSON (la columna es jsonb); solo en {@code FINISHED}. */
  @Column(name = "rounds")
  @ColumnTransformer(read = "\"rounds\"::text", write = "?::jsonb")
  private String rounds;

  @Column(name = "startedAt")
  private Instant startedAt;

  /** Al pasar a {@code FINISHED} o {@code ABANDONED}. */
  @Column(name = "finishedAt")
  private Instant finishedAt;

  protected DailyResultEntity() {}

  public static DailyResultEntity started(String id, String userId, LocalDate date, String gameId, Instant now) {
    var e = new DailyResultEntity();
    e.id = id;
    e.userId = userId;
    e.date = date;
    e.gameId = gameId;
    e.status = STARTED;
    e.startedAt = now;
    return e;
  }

  public String getId() {
    return id;
  }

  public String getUserId() {
    return userId;
  }

  public LocalDate getDate() {
    return date;
  }

  public String getGameId() {
    return gameId;
  }

  public String getStatus() {
    return status;
  }

  public Integer getScore() {
    return score;
  }

  public Integer getCorrect() {
    return correct;
  }

  public String getRounds() {
    return rounds;
  }

  public Instant getStartedAt() {
    return startedAt;
  }

  public Instant getFinishedAt() {
    return finishedAt;
  }
}

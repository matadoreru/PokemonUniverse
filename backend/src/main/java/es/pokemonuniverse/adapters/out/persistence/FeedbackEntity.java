package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.domain.feedback.FeedbackReference;
import es.pokemonuniverse.domain.feedback.FeedbackStatus;
import es.pokemonuniverse.domain.feedback.FeedbackType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Tabla "Feedback" de Prisma. */
@Entity
@Table(name = "Feedback")
public class FeedbackEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "reference", columnDefinition = "\"FeedbackReference\"")
  private FeedbackReference reference;

  @Column(name = "gameId")
  private String gameId;

  @Column(name = "roomCode")
  private String roomCode;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "type", columnDefinition = "\"FeedbackType\"")
  private FeedbackType type;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "status", columnDefinition = "\"FeedbackStatus\"")
  private FeedbackStatus status = FeedbackStatus.NEW;

  @Column(name = "description")
  private String description;

  @Column(name = "authorUserId")
  private String authorUserId;

  @Column(name = "authorDisplayName")
  private String authorDisplayName;

  @Column(name = "authorKind")
  private String authorKind;

  @Column(name = "createdAt")
  private Instant createdAt;

  @Column(name = "updatedAt")
  private Instant updatedAt;

  protected FeedbackEntity() {}

  public static FeedbackEntity create(String id, FeedbackReference reference, String gameId, String roomCode,
      FeedbackType type, String description, String authorUserId, String authorDisplayName, String authorKind,
      Instant now) {
    var e = new FeedbackEntity();
    e.id = id;
    e.reference = reference;
    e.gameId = gameId;
    e.roomCode = roomCode;
    e.type = type;
    e.description = description;
    e.authorUserId = authorUserId;
    e.authorDisplayName = authorDisplayName;
    e.authorKind = authorKind;
    e.createdAt = now;
    e.updatedAt = now;
    return e;
  }

  public String getId() { return id; }
  public FeedbackReference getReference() { return reference; }
  public String getGameId() { return gameId; }
  public String getRoomCode() { return roomCode; }
  public FeedbackType getType() { return type; }
  public FeedbackStatus getStatus() { return status; }
  public String getDescription() { return description; }
  public String getAuthorUserId() { return authorUserId; }
  public String getAuthorDisplayName() { return authorDisplayName; }
  public String getAuthorKind() { return authorKind; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
}

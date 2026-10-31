package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Mapeo de la tabla "RoomHistory": una fila por sala creada ({@code id} = {@code historyId} de la sala). */
@Entity
@Table(name = "RoomHistory")
public class RoomHistoryEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "roomCode")
  private String roomCode;

  @Column(name = "hostUserId")
  private String hostUserId;

  @Column(name = "hostDisplayName")
  private String hostDisplayName;

  @Column(name = "maxPlayers")
  private int maxPlayers;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "status", columnDefinition = "\"RoomHistoryStatus\"")
  private RoomHistoryStatus status = RoomHistoryStatus.ACTIVE;

  @Column(name = "closeReason")
  private String closeReason;

  @Column(name = "createdAt")
  private Instant createdAt;

  @Column(name = "endedAt")
  private Instant endedAt;

  /** {@code @updatedAt} de Prisma: lo escribe la aplicación en cada cambio. */
  @Column(name = "updatedAt")
  private Instant updatedAt;

  protected RoomHistoryEntity() {}

  public static RoomHistoryEntity create(String id, String roomCode, String hostUserId, String hostDisplayName,
      int maxPlayers, Instant createdAt, Instant now) {
    var room = new RoomHistoryEntity();
    room.id = id;
    room.roomCode = roomCode;
    room.hostUserId = hostUserId;
    room.hostDisplayName = hostDisplayName;
    room.maxPlayers = maxPlayers;
    room.createdAt = createdAt;
    room.updatedAt = now;
    return room;
  }

  public String getId() {
    return id;
  }

  public String getRoomCode() {
    return roomCode;
  }

  public String getHostUserId() {
    return hostUserId;
  }

  public String getHostDisplayName() {
    return hostDisplayName;
  }

  public int getMaxPlayers() {
    return maxPlayers;
  }

  public RoomHistoryStatus getStatus() {
    return status;
  }

  public String getCloseReason() {
    return closeReason;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getEndedAt() {
    return endedAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}

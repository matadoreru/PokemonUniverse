package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Tabla "UserGameConfig" de Prisma, única por {@code (userId, gameId)}. {@code config} es el texto JSON del
 * {@code JSONB} tal cual (puede no ser un objeto si la fila está corrupta); {@code updatedAt} no tiene valor por defecto
 * en la BD ({@code @updatedAt}).
 */
@Entity
@Table(name = "UserGameConfig")
public class UserGameConfigEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "userId")
  private String userId;

  @Column(name = "gameId")
  private String gameId;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "config")
  private String config;

  @Column(name = "createdAt")
  private Instant createdAt;

  @Column(name = "updatedAt")
  private Instant updatedAt;

  protected UserGameConfigEntity() {}

  public String getId() { return id; }
  public String getUserId() { return userId; }
  public String getGameId() { return gameId; }
  public String getConfig() { return config; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
}

package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Tabla "PasswordResetToken": guarda el hash del token de recuperación, nunca el token. */
@Entity
@Table(name = "PasswordResetToken")
public class PasswordResetTokenEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "userId")
  private String userId;

  /** SHA-256 en hex del token. */
  @Column(name = "tokenHash")
  private String tokenHash;

  @Column(name = "expiresAt")
  private Instant expiresAt;

  /** Marca de un solo uso; {@code null} mientras el token no se haya gastado ni invalidado. */
  @Column(name = "usedAt")
  private Instant usedAt;

  @Column(name = "createdAt")
  private Instant createdAt;

  protected PasswordResetTokenEntity() {}

  public static PasswordResetTokenEntity create(String id, String userId, String tokenHash, Instant expiresAt,
      Instant now) {
    var e = new PasswordResetTokenEntity();
    e.id = id;
    e.userId = userId;
    e.tokenHash = tokenHash;
    e.expiresAt = expiresAt;
    e.createdAt = now;
    return e;
  }

  public String getId() {
    return id;
  }

  public String getUserId() {
    return userId;
  }

  public String getTokenHash() {
    return tokenHash;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public Instant getUsedAt() {
    return usedAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public void markUsed(Instant now) {
    this.usedAt = now;
  }
}

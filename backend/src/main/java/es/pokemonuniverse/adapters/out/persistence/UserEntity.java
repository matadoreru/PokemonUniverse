package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.domain.identity.UserRole;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Mapeo de la tabla "User" de Prisma. */
@Entity
@Table(name = "User")
public class UserEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Column(name = "username")
  private String username;

  @Column(name = "email")
  private String email;

  @Column(name = "passwordHash")
  private String passwordHash;

  /** Columna heredada que ya no se usa; Prisma la exige NOT NULL. */
  @Column(name = "avatarSeed")
  private String avatarSeed = "";

  @Column(name = "avatarType")
  private String avatarType = "DEFAULT";

  @Column(name = "avatarValue")
  private String avatarValue;

  @Column(name = "avatarVersion")
  private int avatarVersion;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "role", columnDefinition = "\"UserRole\"")
  private UserRole role = UserRole.USER;

  @Column(name = "createdAt")
  private Instant createdAt;

  @Column(name = "updatedAt")
  private Instant updatedAt;

  protected UserEntity() {}

  /** Fábrica en lugar de constructor público: Micronaut Data solo admite constructores cuyos argumentos sean propiedades. */
  public static UserEntity create(String id, String username, String email, String passwordHash, Instant now) {
    var user = new UserEntity();
    user.id = id;
    user.username = username;
    user.email = email;
    user.passwordHash = passwordHash;
    user.createdAt = now;
    user.updatedAt = now;
    return user;
  }

  public String getId() {
    return id;
  }

  public String getUsername() {
    return username;
  }

  public String getEmail() {
    return email;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public String getAvatarType() {
    return avatarType;
  }

  public String getAvatarValue() {
    return avatarValue;
  }

  public int getAvatarVersion() {
    return avatarVersion;
  }

  public UserRole getRole() {
    return role;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}

package es.pokemonuniverse.adapters.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;

/** Tabla "UserAchievement": un logro desbloqueado por una cuenta. Solo se lee; se inserta con {@link UserAchievementInserts}. */
@Entity
@Table(name = "UserAchievement")
@IdClass(UserAchievementId.class)
public class UserAchievementEntity {

  @Id @Column(name = "userId") private String userId;
  @Id @Column(name = "achievementId") private String achievementId;

  @Column(name = "unlockedAt")
  private Instant unlockedAt;

  protected UserAchievementEntity() {}

  public String getUserId() { return userId; }
  public String getAchievementId() { return achievementId; }
  public Instant getUnlockedAt() { return unlockedAt; }
}

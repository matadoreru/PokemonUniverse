package es.pokemonuniverse.adapters.out.persistence;

import java.io.Serializable;

/** Clave compuesta de "UserAchievement": mismos nombres y tipos que los campos {@code @Id} de la entidad. */
public record UserAchievementId(String userId, String achievementId) implements Serializable {
  public UserAchievementId() {
    this(null, null);
  }
}

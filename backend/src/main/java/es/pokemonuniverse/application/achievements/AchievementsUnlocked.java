package es.pokemonuniverse.application.achievements;

import es.pokemonuniverse.domain.achievements.Achievement;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/**
 * Lo nuevo de una cuenta al guardar una partida: los logros desbloqueados y los récords personales batidos. Es la carga
 * del evento {@code achievements:unlocked}; lleva el nombre y la descripción reales, también de los secretos.
 */
@Serdeable
public record AchievementsUnlocked(List<AchievementUnlock> achievements, List<PersonalRecord> records) {

  public AchievementsUnlocked {
    achievements = List.copyOf(achievements);
    records = List.copyOf(records);
  }

  /** Un logro recién desbloqueado; {@code family} es el nombre de {@code AchievementFamily}. */
  @Serdeable
  public record AchievementUnlock(String id, String family, @Nullable String gameId, String name,
      String description) {

    public static AchievementUnlock of(Achievement achievement) {
      return new AchievementUnlock(achievement.id(), achievement.family().name(), achievement.gameId(),
          achievement.name(), achievement.description());
    }
  }

  /** Un récord personal que sube: el valor nuevo y el anterior (0 si no había). */
  @Serdeable
  public record PersonalRecord(String gameId, String key, String label, long value, long previous) {}
}

package es.pokemonuniverse.adapters.in.rest.achievements;

import es.pokemonuniverse.application.achievements.AchievementView;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Los logros de la cuenta con el recuento de desbloqueados. */
@Serdeable
public record AchievementsResponse(List<AchievementResponse> achievements, int unlocked, int total) {

  static AchievementsResponse of(List<AchievementView> views) {
    return new AchievementsResponse(views.stream().map(AchievementResponse::of).toList(),
        (int) views.stream().filter(v -> v.unlockedAt() != null).count(), views.size());
  }
}

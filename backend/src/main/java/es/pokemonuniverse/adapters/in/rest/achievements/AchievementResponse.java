package es.pokemonuniverse.adapters.in.rest.achievements;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.application.achievements.AchievementView;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;

/** Un logro de la cuenta; {@code gameId} y {@code unlockedAt} salen siempre, con {@code null} si no aplican. */
@Serdeable
public record AchievementResponse(
    String id,
    String family,
    @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String gameId,
    String name,
    String description,
    @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String unlockedAt) {

  static AchievementResponse of(AchievementView view) {
    return new AchievementResponse(view.id(), view.family().name(), view.gameId(), view.name(), view.description(),
        view.unlockedAt() == null ? null : IsoTimestamps.millis(view.unlockedAt()));
  }
}

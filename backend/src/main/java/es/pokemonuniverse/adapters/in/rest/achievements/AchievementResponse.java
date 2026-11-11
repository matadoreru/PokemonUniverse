package es.pokemonuniverse.adapters.in.rest.achievements;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.application.achievements.AchievementView;
import es.pokemonuniverse.domain.achievements.AchievementFamily;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;

/** Un logro de la cuenta; {@code gameId} y {@code unlockedAt} salen siempre, con {@code null} si no aplican. */
@Serdeable
public record AchievementResponse(
    String id,
    @Schema(implementation = AchievementFamily.class, requiredMode = Schema.RequiredMode.REQUIRED) String family,
    @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String gameId,
    String name,
    String description,
    @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String unlockedAt) {

  public static AchievementResponse of(AchievementView view) {
    return new AchievementResponse(view.id(), view.family().name(), view.gameId(), view.name(), view.description(),
        view.unlockedAt() == null ? null : IsoTimestamps.millis(view.unlockedAt()));
  }
}

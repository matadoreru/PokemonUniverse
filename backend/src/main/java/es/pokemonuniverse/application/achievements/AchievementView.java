package es.pokemonuniverse.application.achievements;

import es.pokemonuniverse.domain.achievements.AchievementFamily;
import io.micronaut.core.annotation.Nullable;
import java.time.Instant;

/** Un logro tal como lo ve una cuenta: un secreto bloqueado lleva un texto genérico en lugar del real. */
public record AchievementView(String id, AchievementFamily family, @Nullable String gameId, String name,
    String description, @Nullable Instant unlockedAt) {}

package es.pokemonuniverse.domain.achievements;

import io.micronaut.core.annotation.Nullable;
import java.util.function.Predicate;

/**
 * Un logro del catálogo: id estable, familia, juego al que pertenece ({@code null} en los generales y los secretos),
 * nombre y descripción en español y una condición pura sobre los hechos de una partida terminada.
 */
public record Achievement(
    String id,
    AchievementFamily family,
    @Nullable String gameId,
    String name,
    String description,
    Predicate<AchievementFacts> condition) {}

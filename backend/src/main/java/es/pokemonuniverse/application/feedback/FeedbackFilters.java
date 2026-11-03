package es.pokemonuniverse.application.feedback;

import es.pokemonuniverse.domain.feedback.FeedbackReference;
import es.pokemonuniverse.domain.feedback.FeedbackStatus;
import es.pokemonuniverse.domain.feedback.FeedbackType;
import io.micronaut.core.annotation.Nullable;

/** {@code FeedbackFilters} de {@code feedback/service.ts}: filtros exactos y búsqueda; {@code search} vacío no filtra. */
public record FeedbackFilters(@Nullable FeedbackReference reference, @Nullable FeedbackStatus status,
    @Nullable FeedbackType type, String search) {}

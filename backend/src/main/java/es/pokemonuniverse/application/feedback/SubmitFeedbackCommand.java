package es.pokemonuniverse.application.feedback;

import es.pokemonuniverse.domain.feedback.FeedbackReference;
import es.pokemonuniverse.domain.feedback.FeedbackType;
import io.micronaut.core.annotation.Nullable;

/** Feedback ya validado y normalizado; {@code reference} es la referencia efectiva. */
public record SubmitFeedbackCommand(FeedbackReference reference, @Nullable String gameId, @Nullable String roomCode,
    FeedbackType type, String description) {}

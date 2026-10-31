package es.pokemonuniverse.application.feedback;

import es.pokemonuniverse.adapters.out.persistence.FeedbackReference;
import es.pokemonuniverse.adapters.out.persistence.FeedbackType;
import io.micronaut.core.annotation.Nullable;

/** Feedback ya validado y normalizado; {@code reference} es la referencia efectiva. */
public record SubmitFeedbackCommand(FeedbackReference reference, @Nullable String gameId, @Nullable String roomCode,
    FeedbackType type, String description) {}

package es.pokemonuniverse.domain.room;

import io.micronaut.serde.annotation.Serdeable;

/** Mensaje del chat de la sala; {@code seq} crece por sala y no se reutiliza. */
@Serdeable
public record ChatMessage(long seq, String authorId, String authorName, String text, long sentAt) {}

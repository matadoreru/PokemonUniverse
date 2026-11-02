package es.pokemonuniverse.application.wouldyourather;

import java.time.Instant;

/** Fila de "CustomWouldYouRatherPrompt" tal como la guarda la caché del servicio. */
public record StoredWouldYouRatherPrompt(String id, String userId, String optionA, String optionB, String normalizedKey,
    boolean enabled, Instant createdAt, Instant updatedAt) {}

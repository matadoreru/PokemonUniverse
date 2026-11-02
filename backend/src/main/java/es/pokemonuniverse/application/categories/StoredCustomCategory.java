package es.pokemonuniverse.application.categories;

import java.time.Instant;

/** Fila de "CustomCategory" tal como la guarda la caché del servicio. */
public record StoredCustomCategory(String id, String userId, String text, String normalizedText, boolean enabled,
    Instant createdAt, Instant updatedAt) {}

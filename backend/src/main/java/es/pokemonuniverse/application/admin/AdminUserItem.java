package es.pokemonuniverse.application.admin;

import io.micronaut.serde.annotation.Serdeable;

/** {@code AdminUserItem} de {@code shared/admin.ts}. */
@Serdeable
public record AdminUserItem(String id, String username, String email, String role, int gamesPlayed, int gamesWon,
    int totalPoints, String createdAt, String updatedAt) {}

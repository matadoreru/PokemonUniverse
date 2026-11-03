package es.pokemonuniverse.application.admin;

import io.micronaut.serde.annotation.Serdeable;

/** {@code AdminSummary} de {@code shared/admin.ts}. */
@Serdeable
public record AdminSummary(int activeRooms, int gamesInProgress, long registeredUsers, long interruptedToday,
    String updatedAt) {}

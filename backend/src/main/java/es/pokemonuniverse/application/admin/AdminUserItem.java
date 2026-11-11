package es.pokemonuniverse.application.admin;

import es.pokemonuniverse.domain.identity.UserRole;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;

/** {@code AdminUserItem} de {@code shared/admin.ts}. */
@Serdeable
public record AdminUserItem(String id, String username, String email,
    @Schema(implementation = UserRole.class, requiredMode = Schema.RequiredMode.REQUIRED) String role,
    int gamesPlayed, int gamesWon,
    int totalPoints, String createdAt, String updatedAt) {}

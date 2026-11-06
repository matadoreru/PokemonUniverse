package es.pokemonuniverse.adapters.in.rest.auth;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** Cuerpo de {@code PATCH /api/auth/profile}: el ajuste «Perfil visible para». */
@Serdeable
public record ProfileSettingsRequest(
    @NotNull(message = "Elige quién puede ver tu perfil")
        @Pattern(regexp = "^(EVERYONE|FRIENDS|NOBODY)$", message = "Elige quién puede ver tu perfil")
        @Schema(type = "string", allowableValues = {"EVERYONE", "FRIENDS", "NOBODY"})
        @Nullable String profileVisibility) {}

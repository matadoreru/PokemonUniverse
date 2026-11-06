package es.pokemonuniverse.adapters.in.rest.auth;

import es.pokemonuniverse.domain.profile.ProfileVisibility;
import io.micronaut.serde.annotation.Serdeable;

/** Respuesta de {@code PATCH /api/auth/profile}: el ajuste ya guardado. */
@Serdeable
public record ProfileSettingsResponse(ProfileVisibility profileVisibility) {}

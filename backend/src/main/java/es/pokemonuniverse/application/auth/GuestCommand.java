package es.pokemonuniverse.application.auth;

import io.micronaut.core.annotation.Nullable;

/** Datos ya normalizados y validados. */
public record GuestCommand(String displayName, @Nullable String avatarPresetId) {}

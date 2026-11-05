package es.pokemonuniverse.adapters.in.rest.auth;

import io.micronaut.serde.annotation.Serdeable;

/** Respuesta {@code {"progress": ...}} de {@code GET /api/auth/progress} (ProgressResponse en shared). */
@Serdeable
public record ProgressResponse(ProfileResponse.Progress progress) {}

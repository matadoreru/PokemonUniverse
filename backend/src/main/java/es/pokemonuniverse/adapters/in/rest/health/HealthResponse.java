package es.pokemonuniverse.adapters.in.rest.health;

import io.micronaut.serde.annotation.Serdeable;

/** El orden de los componentes es el del JSON de Node. */
@Serdeable
public record HealthResponse(
    String status, String database, String schemaVersion, long uptimeSeconds, String commit, String timestamp) {}

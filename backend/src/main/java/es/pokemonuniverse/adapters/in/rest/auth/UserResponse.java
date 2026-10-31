package es.pokemonuniverse.adapters.in.rest.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;

/** Respuesta {@code {"user": ...}}; la clave se escribe siempre, también como {@code null}. */
@Serdeable
public record UserResponse(@JsonInclude(JsonInclude.Include.ALWAYS) @Nullable AuthUser user) {}

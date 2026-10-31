package es.pokemonuniverse.adapters.in.rest;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Cuerpo de error común con el servidor Node: {@code {"error": "...", "issues": [...]}}. */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(String error, @Nullable List<Issue> issues) {

  @Serdeable
  public record Issue(String path, String message) {}

  public static ApiError of(String error) {
    return new ApiError(error, null);
  }
}

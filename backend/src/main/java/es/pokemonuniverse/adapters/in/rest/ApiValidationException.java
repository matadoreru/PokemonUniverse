package es.pokemonuniverse.adapters.in.rest;

import java.util.List;

/** Fallos de validación detectados a mano (reglas entre campos); se responden como un 400 con {@code issues}. */
public class ApiValidationException extends RuntimeException {

  private final transient List<ApiError.Issue> issues;

  public ApiValidationException(List<ApiError.Issue> issues) {
    super(issues.isEmpty() ? "Invalid request" : issues.get(0).message());
    this.issues = List.copyOf(issues);
  }

  public List<ApiError.Issue> issues() {
    return issues;
  }
}

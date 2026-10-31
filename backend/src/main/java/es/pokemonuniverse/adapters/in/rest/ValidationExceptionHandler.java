package es.pokemonuniverse.adapters.in.rest;

import io.micronaut.context.annotation.Replaces;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import io.micronaut.validation.exceptions.ConstraintExceptionHandler;
import jakarta.inject.Singleton;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import java.util.Comparator;
import java.util.List;

@Produces
@Singleton
@Replaces(ConstraintExceptionHandler.class)
public class ValidationExceptionHandler
    implements ExceptionHandler<ConstraintViolationException, HttpResponse<ApiError>> {

  @Override
  public HttpResponse<ApiError> handle(HttpRequest request, ConstraintViolationException exception) {
    List<ApiError.Issue> issues =
        exception.getConstraintViolations().stream()
            .sorted(Comparator.comparing((ConstraintViolation<?> v) -> v.getPropertyPath().toString()))
            .map(v -> new ApiError.Issue(fieldName(v.getPropertyPath().toString()), v.getMessage()))
            .toList();
    String message = issues.isEmpty() ? "Invalid request" : issues.get(0).message();
    return HttpResponse.badRequest(new ApiError(message, issues));
  }

  /** Quita el prefijo "método.parámetro." (p. ej. "register.input.username" -> "username"). */
  static String fieldName(String path) {
    int dot = path.lastIndexOf('.');
    return dot < 0 ? path : path.substring(dot + 1);
  }
}

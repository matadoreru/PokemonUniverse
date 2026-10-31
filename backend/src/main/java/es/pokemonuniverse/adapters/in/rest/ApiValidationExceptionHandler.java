package es.pokemonuniverse.adapters.in.rest;

import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;

@Produces
@Singleton
public class ApiValidationExceptionHandler
    implements ExceptionHandler<ApiValidationException, HttpResponse<ApiError>> {

  @Override
  public HttpResponse<ApiError> handle(HttpRequest request, ApiValidationException exception) {
    return HttpResponse.badRequest(new ApiError(exception.getMessage(), exception.issues()));
  }
}

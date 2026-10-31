package es.pokemonuniverse.adapters.in.rest;

import io.micronaut.http.annotation.Produces;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;

@Produces
@Singleton
public class ApiExceptionHandler implements ExceptionHandler<ApiException, HttpResponse<ApiError>> {

  @Override
  public HttpResponse<ApiError> handle(HttpRequest request, ApiException exception) {
    return HttpResponse.status(exception.status()).body(ApiError.of(exception.getMessage()));
  }
}

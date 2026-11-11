package es.pokemonuniverse.adapters.in.rest;

import es.pokemonuniverse.application.assets.ResourceCapacityException;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;

/** Demasiadas descargas de recursos en curso (sprites, imágenes y audio de ronda): 503 con su mensaje. */
@Produces
@Singleton
public class ResourceCapacityExceptionHandler
    implements ExceptionHandler<ResourceCapacityException, HttpResponse<ApiError>> {

  @Override
  public HttpResponse<ApiError> handle(HttpRequest request, ResourceCapacityException exception) {
    return HttpResponse.<ApiError>status(HttpStatus.SERVICE_UNAVAILABLE).body(ApiError.of(exception.getMessage()));
  }
}

package es.pokemonuniverse.adapters.in.rest;

import es.pokemonuniverse.application.avatar.AvatarValidationException;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;

/** {@code if (error instanceof AvatarValidationError) res.status(error.status).json({error: error.message})}. */
@Produces
@Singleton
public class AvatarValidationExceptionHandler
    implements ExceptionHandler<AvatarValidationException, HttpResponse<ApiError>> {

  @Override
  public HttpResponse<ApiError> handle(HttpRequest request, AvatarValidationException exception) {
    return HttpResponse.<ApiError>status(HttpStatus.valueOf(exception.status())).body(ApiError.of(exception.getMessage()));
  }
}

package es.pokemonuniverse.adapters.in.rest;

import io.micronaut.context.annotation.Replaces;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.exceptions.ContentLengthExceededException;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;

/**
 * Cuerpo por encima de {@code micronaut.server.max-request-size}: 413 con el mensaje de body-parser
 * ({@code createError(413, 'request entity too large')}), que en Node gana en la rama de {@code status} del manejador
 * global tanto para {@code express.json} como para {@code express.raw}.
 */
@Produces
@Singleton
@Replaces(io.micronaut.http.server.exceptions.ContentLengthExceededHandler.class)
public class RequestTooLargeHandler
    implements ExceptionHandler<ContentLengthExceededException, HttpResponse<ApiError>> {

  public static final String MESSAGE = "request entity too large";

  @Override
  public HttpResponse<ApiError> handle(HttpRequest request, ContentLengthExceededException exception) {
    return HttpResponse.<ApiError>status(HttpStatus.REQUEST_ENTITY_TOO_LARGE).body(ApiError.of(MESSAGE));
  }
}

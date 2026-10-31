package es.pokemonuniverse.adapters.in.rest;

import io.micronaut.context.annotation.Primary;
import io.micronaut.http.MutableHttpResponse;
import io.micronaut.http.server.exceptions.response.Error;
import io.micronaut.http.server.exceptions.response.ErrorContext;
import io.micronaut.http.server.exceptions.response.ErrorResponseProcessor;
import jakarta.inject.Singleton;

/**
 * Sustituye el cuerpo HATEOAS ({@code _links}, {@code _embedded}) que Micronaut genera para sus propios errores
 * (404, 405, 415, cuerpo ausente...) por {@code {"error": "..."}}. Los {@code ExceptionHandler} del paquete son más
 * específicos y siguen respondiendo antes que este procesador.
 */
@Primary
@Singleton
public class ApiErrorResponseProcessor implements ErrorResponseProcessor<ApiError> {

  @Override
  @SuppressWarnings("unchecked")
  public MutableHttpResponse<ApiError> processResponse(ErrorContext context, MutableHttpResponse<?> response) {
    String message = context.getErrors().stream()
        .map(Error::getMessage)
        .filter(m -> m != null && !m.isBlank())
        .findFirst()
        .orElseGet(() -> response.reason() == null || response.reason().isBlank()
            ? response.getStatus().getReason()
            : response.reason());
    return ((MutableHttpResponse<ApiError>) response).body(ApiError.of(message));
  }
}

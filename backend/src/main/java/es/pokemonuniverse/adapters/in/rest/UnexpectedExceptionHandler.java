package es.pokemonuniverse.adapters.in.rest;

import io.micronaut.http.annotation.Produces;
import io.micronaut.context.env.Environment;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Último recurso: 500 con mensaje genérico en prod y el real en el resto de entornos. */
@Produces
@Singleton
public class UnexpectedExceptionHandler implements ExceptionHandler<RuntimeException, HttpResponse<ApiError>> {

  private static final Logger LOG = LoggerFactory.getLogger(UnexpectedExceptionHandler.class);

  private final boolean prod;

  public UnexpectedExceptionHandler(Environment environment) {
    this.prod = environment.getActiveNames().contains("prod");
  }

  @Override
  public HttpResponse<ApiError> handle(HttpRequest request, RuntimeException exception) {
    LOG.error("Unhandled error on {} {}", request.getMethod(), request.getPath(), exception);
    String message = prod || exception.getMessage() == null ? "Internal server error" : exception.getMessage();
    return HttpResponse.serverError(ApiError.of(message));
  }
}

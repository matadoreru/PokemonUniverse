package es.pokemonuniverse.adapters.in.rest;

import io.micronaut.context.annotation.Replaces;
import io.micronaut.core.convert.exceptions.ConversionErrorException;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;

/** Cuerpo que no se puede convertir (claves desconocidas, enums inválidos, tipos erróneos): 400 con el formato de la API. */
@Produces
@Singleton
@Replaces(io.micronaut.http.server.exceptions.ConversionErrorHandler.class)
public class ConversionErrorHandler implements ExceptionHandler<ConversionErrorException, HttpResponse<ApiError>> {

  @Override
  public HttpResponse<ApiError> handle(HttpRequest request, ConversionErrorException exception) {
    return HttpResponse.badRequest(ApiError.of("Invalid request body"));
  }
}

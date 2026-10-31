package es.pokemonuniverse.adapters.in.rest;

import io.micronaut.context.annotation.Replaces;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import io.micronaut.http.server.exceptions.JsonExceptionHandler;
import io.micronaut.json.JsonSyntaxException;
import jakarta.inject.Singleton;

/** Cuerpo JSON mal formado: 400 con el formato de error de la API. */
@Produces
@Singleton
@Replaces(JsonExceptionHandler.class)
public class JsonSyntaxExceptionHandler
    implements ExceptionHandler<JsonSyntaxException, HttpResponse<ApiError>> {

  @Override
  public HttpResponse<ApiError> handle(HttpRequest request, JsonSyntaxException exception) {
    return HttpResponse.badRequest(ApiError.of("Invalid JSON"));
  }
}

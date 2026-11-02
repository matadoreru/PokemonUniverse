package es.pokemonuniverse.adapters.in.rest;

import es.pokemonuniverse.application.errors.InvalidInputException;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.server.exceptions.ExceptionHandler;
import jakarta.inject.Singleton;
import java.util.LinkedHashMap;
import java.util.Map;

/** {@code ZodError} del manejador global de Node: 400 {@code {error: <primer mensaje>, issues}} con las incidencias tal cual. */
@Produces
@Singleton
public class InvalidInputExceptionHandler
    implements ExceptionHandler<InvalidInputException, HttpResponse<Map<String, Object>>> {

  @Override
  public HttpResponse<Map<String, Object>> handle(HttpRequest request, InvalidInputException exception) {
    var body = new LinkedHashMap<String, Object>();
    body.put("error", exception.getMessage());
    body.put("issues", exception.issues());
    return HttpResponse.badRequest(body);
  }
}

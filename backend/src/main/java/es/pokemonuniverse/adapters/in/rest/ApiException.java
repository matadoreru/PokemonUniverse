package es.pokemonuniverse.adapters.in.rest;

import io.micronaut.http.HttpStatus;

/** Error de negocio con el estado HTTP y el mensaje que verá el cliente. */
public class ApiException extends RuntimeException {

  private final HttpStatus status;

  public ApiException(HttpStatus status, String message) {
    super(message);
    this.status = status;
  }

  public HttpStatus status() {
    return status;
  }
}

package es.pokemonuniverse.application.errors;

/** Datos de entrada no válidos para la operación (400). */
public final class BadRequestException extends ApplicationException {

  public BadRequestException(String message) {
    super(message);
  }
}

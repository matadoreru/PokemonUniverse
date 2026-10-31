package es.pokemonuniverse.application.errors;

/** La operación choca con el estado actual, p. ej. un usuario ya existente (409). */
public final class ConflictException extends ApplicationException {

  public ConflictException(String message) {
    super(message);
  }
}

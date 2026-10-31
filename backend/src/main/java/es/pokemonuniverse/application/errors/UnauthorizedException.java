package es.pokemonuniverse.application.errors;

/** Faltan credenciales o no son válidas (401). */
public final class UnauthorizedException extends ApplicationException {

  public UnauthorizedException(String message) {
    super(message);
  }
}

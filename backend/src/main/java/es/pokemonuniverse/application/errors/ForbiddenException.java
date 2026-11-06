package es.pokemonuniverse.application.errors;

/** La cuenta está identificada pero no puede hacer esta operación todavía (403). */
public non-sealed class ForbiddenException extends ApplicationException {

  public ForbiddenException(String message) {
    super(message);
  }
}

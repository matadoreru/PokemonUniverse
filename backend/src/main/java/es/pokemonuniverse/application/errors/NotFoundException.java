package es.pokemonuniverse.application.errors;

/** El recurso pedido no existe (404). */
public final class NotFoundException extends ApplicationException {

  public NotFoundException(String message) {
    super(message);
  }
}

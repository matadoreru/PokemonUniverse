package es.pokemonuniverse.application.avatar;

/**
 * Imagen de avatar rechazada ({@code AvatarValidationError} de Node, siempre 400). El mensaje es uno de los literales de
 * {@link AvatarService} y el manejador REST lo devuelve como {@code {error}}.
 */
public final class AvatarValidationException extends RuntimeException {

  public AvatarValidationException(String message) {
    super(message);
  }

  public int status() {
    return 400;
  }
}

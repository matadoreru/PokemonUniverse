package es.pokemonuniverse.application.auth;

/** Token de sesión no válido: firma, caducidad o claims obligatorios incorrectos. */
public class InvalidTokenException extends RuntimeException {

  public InvalidTokenException(String message) {
    super(message);
  }

  public InvalidTokenException(String message, Throwable cause) {
    super(message, cause);
  }
}

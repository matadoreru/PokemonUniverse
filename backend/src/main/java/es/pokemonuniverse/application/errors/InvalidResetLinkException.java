package es.pokemonuniverse.application.errors;

/** Enlace de recuperación de contraseña ausente, malformado, usado, sustituido o caducado (400). */
public final class InvalidResetLinkException extends ApplicationException {

  public InvalidResetLinkException() {
    super("Invalid or expired reset link");
  }
}

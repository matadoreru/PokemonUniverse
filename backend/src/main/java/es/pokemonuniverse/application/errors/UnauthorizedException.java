package es.pokemonuniverse.application.errors;

/** Faltan credenciales o no son válidas (401). */
public final class UnauthorizedException extends ApplicationException {

  /** Sin sesión, con sesión de invitado o con una cuenta que ya no existe: el 401 de las rutas de cuenta registrada. */
  public static final String REGISTERED_REQUIRED = "Registered account required";

  public UnauthorizedException(String message) {
    super(message);
  }
}

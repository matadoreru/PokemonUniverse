package es.pokemonuniverse.application.assets;

/** {@code ResourceCapacityError} de Node: demasiados recursos pendientes; el adaptador HTTP responde 503. */
public class ResourceCapacityException extends RuntimeException {

  public static final String MESSAGE = "El servidor está procesando demasiados recursos. Reintenta en unos segundos.";

  public ResourceCapacityException() {
    super(MESSAGE);
  }
}

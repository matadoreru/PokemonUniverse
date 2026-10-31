package es.pokemonuniverse.application.rooms;

/**
 * Rechazo de un comando de sala con el mensaje literal de {@code manager.ts} (el {@code throw new Error(...)} que el
 * transporte convierte en {@code {ok:false,error}}).
 */
public class RoomException extends RuntimeException {

  public RoomException(String message) {
    super(message, null, false, false);
  }
}

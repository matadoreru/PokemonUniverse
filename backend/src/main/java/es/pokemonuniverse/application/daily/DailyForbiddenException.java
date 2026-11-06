package es.pokemonuniverse.application.daily;

import es.pokemonuniverse.application.errors.ForbiddenException;

/** La clasificación del día solo se ve después de jugar el reto (403). */
public final class DailyForbiddenException extends ForbiddenException {

  public static final String PLAY_FIRST = "Play today's challenge first";

  public DailyForbiddenException() {
    super(PLAY_FIRST);
  }
}

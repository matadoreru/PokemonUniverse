package es.pokemonuniverse.application.daily;

import es.pokemonuniverse.application.errors.BadRequestException;

/** Petición del reto diario rechazada (400). */
public final class DailyException extends BadRequestException {

  public DailyException(String message) {
    super(message);
  }
}

package es.pokemonuniverse.application.avatar;

import es.pokemonuniverse.application.errors.BadRequestException;

/** Imagen de avatar rechazada (400). El mensaje es uno de los literales de {@link AvatarService}. */
public final class AvatarValidationException extends BadRequestException {

  public AvatarValidationException(String message) {
    super(message);
  }
}

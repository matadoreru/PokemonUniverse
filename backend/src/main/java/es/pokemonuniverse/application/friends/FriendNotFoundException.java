package es.pokemonuniverse.application.friends;

import es.pokemonuniverse.application.errors.NotFoundException;

/** La solicitud o la amistad no existe o no es del usuario (404). */
public final class FriendNotFoundException extends NotFoundException {

  public FriendNotFoundException() {
    super("Friend request not found");
  }
}

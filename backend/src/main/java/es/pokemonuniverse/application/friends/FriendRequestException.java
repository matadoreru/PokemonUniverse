package es.pokemonuniverse.application.friends;

import es.pokemonuniverse.application.errors.BadRequestException;

/** Solicitud de amistad rechazada (400). El mensaje genérico no revela si la cuenta existe. */
public final class FriendRequestException extends BadRequestException {

  public static final String CANNOT_SEND = "Cannot send a friend request to this user";
  public static final String FRIEND_LIMIT = "Friend limit reached";
  public static final String TOO_MANY_PENDING = "Too many pending requests";

  public FriendRequestException(String message) {
    super(message);
  }

  public static FriendRequestException cannotSend() {
    return new FriendRequestException(CANNOT_SEND);
  }
}

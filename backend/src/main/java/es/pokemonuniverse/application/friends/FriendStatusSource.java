package es.pokemonuniverse.application.friends;

/** Puerto de presencia: el estado actual de una cuenta. Lo implementa {@code FriendPresence}. */
@FunctionalInterface
public interface FriendStatusSource {

  FriendStatus statusOf(String userId);
}

package es.pokemonuniverse.config;

import es.pokemonuniverse.application.friends.FriendEvents;
import es.pokemonuniverse.application.friends.FriendStatus;
import es.pokemonuniverse.application.friends.FriendStatusSource;
import es.pokemonuniverse.application.rooms.RoomActivity;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Secondary;
import jakarta.inject.Singleton;

/**
 * Valores por defecto de los puertos de amigos, {@code @Secondary}: {@code FriendPresence} los gana siempre que existe.
 * Siguen aquí para los contextos que la quitan (un {@code @Replaces(FriendEvents.class)} de prueba también retira a
 * {@code FriendPresence}): sin presencia todos salen desconectados y los cambios no avisan a nadie.
 */
@Factory
public class FriendBeans {

  @Singleton
  @Secondary
  FriendStatusSource friendStatusSource() {
    return userId -> FriendStatus.OFFLINE;
  }

  @Singleton
  @Secondary
  FriendEvents friendEvents() {
    return (a, b) -> {};
  }

  @Singleton
  @Secondary
  RoomActivity roomActivity() {
    return RoomActivity.NONE;
  }
}

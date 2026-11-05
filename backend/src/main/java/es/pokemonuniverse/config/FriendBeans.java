package es.pokemonuniverse.config;

import es.pokemonuniverse.application.friends.FriendEvents;
import es.pokemonuniverse.application.friends.FriendStatus;
import es.pokemonuniverse.application.friends.FriendStatusSource;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Secondary;
import jakarta.inject.Singleton;

/**
 * Valores por defecto de los puertos de amigos, {@code @Secondary} para que la presencia real (y las pruebas) los
 * reemplacen: sin presencia todos salen desconectados y los cambios no avisan a nadie.
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
}

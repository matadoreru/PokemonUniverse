package es.pokemonuniverse.config;

import es.pokemonuniverse.application.avatar.AvatarAssignment;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.BeanCreatedEvent;
import io.micronaut.context.event.BeanCreatedEventListener;
import jakarta.inject.Singleton;
import javax.sql.DataSource;

/**
 * {@code onAvatarUpdated((userId, avatar) => rooms.updateIdentityAvatar(userId, avatar))} de {@code index.ts}: cada
 * cambio de avatar de un usuario registrado reemite {@code room:state} de su sala. Se suscribe al crearse el
 * coordinador, como {@link HostContentWiring.CoordinatorSubscription}: con las salas apagadas no hay nada que avisar.
 */
@Singleton
@Requires(beans = DataSource.class)
public class AvatarWiring implements BeanCreatedEventListener<RoomCoordinator> {

  private final AvatarAssignment avatars;

  public AvatarWiring(AvatarAssignment avatars) {
    this.avatars = avatars;
  }

  @Override
  public RoomCoordinator onCreated(BeanCreatedEvent<RoomCoordinator> event) {
    var coordinator = event.getBean();
    avatars.onAvatarUpdated(coordinator::updateIdentityAvatar);
    return coordinator;
  }
}

package es.pokemonuniverse.adapters.in.ws;

import es.pokemonuniverse.application.friends.UserConnections;
import jakarta.inject.Singleton;

/** {@link UserConnections} sobre las conexiones abiertas de {@link WsSessions}; los envíos no bloquean. */
@Singleton
public class WsUserConnections implements UserConnections {

  private final WsSessions sessions;

  public WsUserConnections(WsSessions sessions) {
    this.sessions = sessions;
  }

  @Override
  public boolean isOnline(String userId) {
    return !sessions.connectionsOf(userId).isEmpty();
  }

  @Override
  public void send(String userId, String event, Object payload) {
    for (var connection : sessions.connectionsOf(userId)) sessions.push(userId, connection.id(), event, payload);
  }
}

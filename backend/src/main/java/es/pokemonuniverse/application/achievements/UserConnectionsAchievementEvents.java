package es.pokemonuniverse.application.achievements;

import es.pokemonuniverse.application.friends.UserConnections;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** {@link AchievementEvents} sobre {@link UserConnections}: llega a todas las pestañas abiertas de la cuenta. */
@Singleton
public class UserConnectionsAchievementEvents implements AchievementEvents {

  static final String EVENT = "achievements:unlocked";
  private static final Logger LOG = LoggerFactory.getLogger(UserConnectionsAchievementEvents.class);

  private final UserConnections connections;

  public UserConnectionsAchievementEvents(UserConnections connections) {
    this.connections = connections;
  }

  @Override
  public void unlocked(String userId, AchievementsUnlocked payload) {
    try {
      connections.send(userId, EVENT, payload);
    } catch (RuntimeException error) {
      // Los logros ya están guardados; un aviso perdido no deshace nada.
      LOG.warn("Failed to send {} to {}", EVENT, userId, error);
    }
  }
}

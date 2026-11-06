package es.pokemonuniverse.application.achievements;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.application.achievements.AchievementsUnlocked.AchievementUnlock;
import es.pokemonuniverse.application.achievements.AchievementsUnlocked.PersonalRecord;
import es.pokemonuniverse.application.friends.UserConnections;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class UserConnectionsAchievementEventsTest {

  private record Sent(String userId, String event, Object payload) {}

  private static final AchievementsUnlocked PAYLOAD = new AchievementsUnlocked(
      List.of(new AchievementUnlock("general.first-game", "GENERAL", null, "Primera partida", "Juega una partida")),
      List.of(new PersonalRecord("higher-lower", "endlessBestStreak", "Récord en Racha infinita", 12, 8)));

  @Test
  void sendsEventNameAndPayload() {
    var sent = new ArrayList<Sent>();
    var events = new UserConnectionsAchievementEvents(new UserConnections() {
      @Override
      public boolean isOnline(String userId) {
        return true;
      }

      @Override
      public void send(String userId, String event, Object payload) {
        sent.add(new Sent(userId, event, payload));
      }
    });

    events.unlocked("user-1", PAYLOAD);

    assertEquals(List.of(new Sent("user-1", "achievements:unlocked", PAYLOAD)), sent);
  }

  @Test
  void swallowsSendFailures() {
    var events = new UserConnectionsAchievementEvents(new UserConnections() {
      @Override
      public boolean isOnline(String userId) {
        return true;
      }

      @Override
      public void send(String userId, String event, Object payload) {
        throw new IllegalStateException("socket closed");
      }
    });

    assertDoesNotThrow(() -> events.unlocked("user-1", PAYLOAD));
  }
}

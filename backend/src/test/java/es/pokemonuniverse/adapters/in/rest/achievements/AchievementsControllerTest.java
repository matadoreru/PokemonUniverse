package es.pokemonuniverse.adapters.in.rest.achievements;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.adapters.out.persistence.UserAchievementInserts;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.transaction.TransactionOperations;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.Session;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
class AchievementsControllerTest {

  @Inject @Client("/") HttpClient client;
  @Inject EntityManager em;
  @Inject TransactionOperations<Session> transactions;

  private record Account(String id, String cookie) {}

  @SuppressWarnings("unchecked")
  private Account register() {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", "ac_" + u, "email", "ac" + u + "@mail.com", "password", "0123456789")), Map.class);
    var cookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    return new Account((String) ((Map<String, Object>) res.body().get("user")).get("id"), cookie);
  }

  private String raw(Account as) {
    var request = HttpRequest.GET("/api/achievements").header("Cookie", as.cookie());
    return client.toBlocking().retrieve(request, String.class);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(Account as) {
    var request = HttpRequest.GET("/api/achievements").header("Cookie", as.cookie());
    return client.toBlocking().retrieve(request, Map.class);
  }

  private void unlock(Account as, String... ids) {
    transactions.executeWrite(status -> UserAchievementInserts.insertMissing(em, as.id(), List.of(ids), Instant.now()));
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> achievements(Map<String, Object> body) {
    return (List<Map<String, Object>>) body.get("achievements");
  }

  @Test
  void guestGets401() {
    var guest = client.toBlocking().exchange(
        HttpRequest.POST("/api/auth/guest", Map.of("displayName", "Invitado")), Map.class);
    var cookie = guest.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    for (var request : List.of(HttpRequest.GET("/api/achievements"),
        HttpRequest.GET("/api/achievements").header("Cookie", cookie))) {
      var e = assertThrows(HttpClientResponseException.class, () -> client.toBlocking().exchange(request, Map.class));
      assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus());
    }
  }

  @Test
  void listsFortyEightInCatalogOrder() {
    var body = get(register());
    assertEquals(51, body.get("total"));
    assertEquals(0, body.get("unlocked"));
    assertEquals(51, achievements(body).size());
    assertEquals("general.first-game", achievements(body).get(0).get("id"));
  }

  @Test
  void unlockedCarriesDate() {
    var as = register();
    unlock(as, "general.first-game");
    var body = get(as);
    assertEquals(1, body.get("unlocked"));
    var first = achievements(body).get(0);
    assertNotNull(first.get("unlockedAt"));
    assertNull(achievements(body).get(1).get("unlockedAt"));
  }

  @Test
  void lockedSecretsLeakNothing() {
    var text = raw(register());
    for (var leak : List.of("Foto finish", "Fiel", "Búho nocturno", "Lo importante es participar")) {
      assertFalse(text.contains(leak), leak);
    }
  }

  @Test
  void unlockedSecretShowsRealName() {
    var as = register();
    unlock(as, "secret.3");
    var secret = achievements(get(as)).stream().filter(a -> a.get("id").equals("secret.3")).findFirst().orElseThrow();
    assertEquals("Búho nocturno", secret.get("name"));
  }

  @Test
  void unknownStoredIdIgnored() {
    var as = register();
    unlock(as, "game.removed.win");
    var body = get(as);
    assertEquals(51, body.get("total"));
    assertEquals(0, body.get("unlocked"));
  }
}

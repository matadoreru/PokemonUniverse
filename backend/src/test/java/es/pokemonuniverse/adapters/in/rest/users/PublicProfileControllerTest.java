package es.pokemonuniverse.adapters.in.rest.users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.UserAchievementInserts;
import es.pokemonuniverse.adapters.out.persistence.UserGameStatsEntity;
import es.pokemonuniverse.adapters.out.persistence.UserGameStatsRepository;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.transaction.TransactionOperations;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.hibernate.Session;
import org.junit.jupiter.api.Test;

/** {@code GET /api/users/{username}/profile} y el ajuste {@code PATCH /api/auth/profile}. */
@MicronautTest(transactional = false)
class PublicProfileControllerTest {

  @Inject @Client("/") HttpClient client;
  @Inject EntityManager em;
  @Inject TransactionOperations<Session> transactions;
  @Inject UserGameStatsRepository gameStats;

  private record Account(String id, String cookie, String username, String email) {}

  @SuppressWarnings("unchecked")
  private Account register() {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var username = "pp_" + u;
    var email = "pp" + u + "@mail.com";
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", username, "email", email, "password", "0123456789")), Map.class);
    var cookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    return new Account((String) ((Map<String, Object>) res.body().get("user")).get("id"), cookie, username, email);
  }

  private String guestCookie() {
    var guest = client.toBlocking().exchange(
        HttpRequest.POST("/api/auth/guest", Map.of("displayName", "Invitado")), Map.class);
    return guest.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
  }

  private String raw(Account viewer, String username) {
    return client.toBlocking().retrieve(
        HttpRequest.GET("/api/users/" + username + "/profile").header("Cookie", viewer.cookie()), String.class);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> view(Account viewer, String username) {
    var body = client.toBlocking().retrieve(
        HttpRequest.GET("/api/users/" + username + "/profile").header("Cookie", viewer.cookie()), Map.class);
    return (Map<String, Object>) body.get("profile");
  }

  private void setVisibility(Account as, String visibility) {
    var res = client.toBlocking().exchange(HttpRequest.PATCH("/api/auth/profile", Map.of("profileVisibility", visibility))
        .header("Cookie", as.cookie()), Map.class);
    assertEquals(HttpStatus.OK, res.status());
  }

  @SuppressWarnings("unchecked")
  private void befriend(Account a, Account b) {
    var sent = client.toBlocking().exchange(HttpRequest.POST("/api/friends/requests", Map.of("username", b.username()))
        .header("Cookie", a.cookie()), Map.class);
    var id = (String) ((Map<String, Object>) sent.body().get("request")).get("id");
    client.toBlocking().exchange(HttpRequest.POST("/api/friends/requests/" + id + "/accept", Map.of())
        .header("Cookie", b.cookie()), Map.class);
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> map(Object o) {
    return (Map<String, Object>) o;
  }

  private static void assertFull(Map<String, Object> profile) {
    assertEquals(false, profile.get("private"));
    assertTrue(profile.containsKey("progress"));
    assertTrue(profile.containsKey("stats"));
    assertTrue(profile.containsKey("achievements"));
  }

  /** Sin nivel, estadísticas, logros ni fecha de alta: ni siquiera las claves. */
  private static void assertPrivate(String raw) {
    assertTrue(raw.contains("\"private\":true"), raw);
    for (var leak : List.of("progress", "level", "\"xp\"", "stats", "globalStats", "games", "achievements", "unlocked",
        "createdAt")) {
      assertFalse(raw.contains(leak), leak + " en " + raw);
    }
  }

  @Test
  void guestsAndAnonymousGet401() {
    var target = register();
    var guest = guestCookie();
    for (MutableHttpRequest<?> request : List.of(
        HttpRequest.GET("/api/users/" + target.username() + "/profile"),
        HttpRequest.GET("/api/users/" + target.username() + "/profile").header("Cookie", guest),
        HttpRequest.PATCH("/api/auth/profile", Map.of("profileVisibility", "NOBODY")),
        HttpRequest.PATCH("/api/auth/profile", Map.of("profileVisibility", "NOBODY")).header("Cookie", guest))) {
      var e = assertThrows(HttpClientResponseException.class, () -> client.toBlocking().exchange(request, Map.class));
      assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus());
      assertEquals(Map.of("error", "Registered account required"), e.getResponse().getBody(Map.class).orElseThrow());
    }
  }

  @Test
  void unknownOrMalformedUsernameIs404() {
    var viewer = register();
    for (var name : List.of("nadie_" + UUID.randomUUID().toString().substring(0, 8), "a%20b", "x".repeat(25))) {
      var e = assertThrows(HttpClientResponseException.class, () -> view(viewer, name));
      assertEquals(HttpStatus.NOT_FOUND, e.getStatus(), name);
    }
  }

  @Test
  void visibleProfileShowsLevelStatsAndOnlyUnlockedAchievements() {
    var viewer = register();
    var target = register();
    gameStats.save(UserGameStatsEntity.create(UUID.randomUUID().toString(), target.id(), "type-duel", 3, 1, 9, Map.of()));
    transactions.executeWrite(status -> UserAchievementInserts.insertMissing(em, target.id(),
        List.of("general.first-game", "secret.3"), Instant.now()));

    var profile = view(viewer, target.username());
    assertFull(profile);
    var user = map(profile.get("user"));
    assertEquals(target.username(), user.get("username"));
    assertEquals(Map.of("type", "DEFAULT"), user.get("avatar"));
    assertTrue(((String) user.get("createdAt")).endsWith("Z"));
    assertEquals("EVERYONE", profile.get("visibility"));
    assertEquals("NONE", profile.get("friendship"));
    assertEquals(1, map(profile.get("progress")).get("level"));
    assertEquals(Map.of("gamesPlayed", 0, "gamesWon", 0, "totalPoints", 0), map(profile.get("stats")).get("globalStats"));
    @SuppressWarnings("unchecked")
    var games = (List<Map<String, Object>>) map(profile.get("stats")).get("games");
    var typeDuel = games.stream().filter(g -> "type-duel".equals(g.get("id"))).findFirst().orElseThrow();
    assertEquals(3, map(typeDuel.get("stats")).get("gamesPlayed"));

    var achievements = map(profile.get("achievements"));
    assertEquals(2, achievements.get("unlocked"));
    assertEquals(50, achievements.get("total"));
    @SuppressWarnings("unchecked")
    var list = (List<Map<String, Object>>) achievements.get("achievements");
    assertEquals(List.of("general.first-game", "secret.3"), list.stream().map(a -> a.get("id")).toList());
    assertEquals("Búho nocturno", list.get(1).get("name"));
  }

  @Test
  void neverLeaksEmailNorLockedSecrets() {
    var viewer = register();
    var target = register();
    var text = raw(viewer, target.username());
    assertFalse(text.contains(target.email()), text);
    assertFalse(text.contains("email"), text);
    for (var leak : List.of("Logro secreto", "Foto finish", "Fiel", "Búho nocturno", "Lo importante es participar")) {
      assertFalse(text.contains(leak), leak);
    }
  }

  @Test
  void lookupIgnoresCase() {
    var viewer = register();
    var target = register();
    var profile = view(viewer, target.username().toUpperCase(Locale.ROOT));
    assertEquals(target.username(), map(profile.get("user")).get("username"));
  }

  @Test
  void friendsOnlyHidesItFromStrangersButNotFromFriends() {
    var target = register();
    var friend = register();
    var stranger = register();
    befriend(friend, target);
    setVisibility(target, "FRIENDS");

    var raw = raw(stranger, target.username());
    assertPrivate(raw);
    assertTrue(raw.contains(target.username()));
    assertTrue(raw.contains("\"avatar\""));

    var seen = view(friend, target.username());
    assertFull(seen);
    assertEquals("FRIENDS", seen.get("friendship"));
    assertEquals("FRIENDS", seen.get("visibility"));
  }

  @Test
  void nobodyHidesItFromFriendsTooButNotFromTheOwner() {
    var target = register();
    var friend = register();
    befriend(friend, target);
    setVisibility(target, "NOBODY");

    assertPrivate(raw(friend, target.username()));
    var own = view(target, target.username());
    assertFull(own);
    assertEquals("SELF", own.get("friendship"));
    assertEquals("NOBODY", own.get("visibility"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void pendingRequestsCarryTheirIdForBothSides() {
    var a = register();
    var b = register();
    var sent = client.toBlocking().exchange(HttpRequest.POST("/api/friends/requests", Map.of("username", b.username()))
        .header("Cookie", a.cookie()), Map.class);
    var requestId = ((Map<String, Object>) sent.body().get("request")).get("id");

    var fromA = view(a, b.username());
    assertEquals("PENDING_SENT", fromA.get("friendship"));
    assertEquals(requestId, fromA.get("requestId"));
    var fromB = view(b, a.username());
    assertEquals("PENDING_RECEIVED", fromB.get("friendship"));
    assertEquals(requestId, fromB.get("requestId"));
    assertNull(view(register(), a.username()).get("requestId"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void ownProfileExposesTheSettingAndPatchValidatesIt() {
    var me = register();
    var own = client.toBlocking().retrieve(HttpRequest.GET("/api/auth/profile").header("Cookie", me.cookie()), Map.class);
    assertEquals("EVERYONE", map(own.get("profile")).get("profileVisibility"));

    var patched = client.toBlocking().retrieve(HttpRequest.PATCH("/api/auth/profile", Map.of("profileVisibility", "FRIENDS"))
        .header("Cookie", me.cookie()), Map.class);
    assertEquals(Map.of("profileVisibility", "FRIENDS"), patched);
    own = client.toBlocking().retrieve(HttpRequest.GET("/api/auth/profile").header("Cookie", me.cookie()), Map.class);
    assertEquals("FRIENDS", map(own.get("profile")).get("profileVisibility"));

    for (Map<String, Object> body : List.of(Map.<String, Object>of("profileVisibility", "ALL"), Map.<String, Object>of())) {
      var e = assertThrows(HttpClientResponseException.class, () -> client.toBlocking().exchange(
          HttpRequest.PATCH("/api/auth/profile", body).header("Cookie", me.cookie()), Map.class));
      assertEquals(HttpStatus.BAD_REQUEST, e.getStatus(), body.toString());
    }
  }
}

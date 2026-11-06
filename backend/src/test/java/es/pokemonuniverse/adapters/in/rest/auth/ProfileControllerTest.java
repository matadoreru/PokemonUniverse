package es.pokemonuniverse.adapters.in.rest.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.UserGameStatsEntity;
import es.pokemonuniverse.adapters.out.persistence.UserGameStatsRepository;
import es.pokemonuniverse.domain.game.GameRegistry;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import io.micronaut.transaction.SynchronousTransactionManager;
import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
class ProfileControllerTest {

  @Inject @Client("/") HttpClient client;
  @Inject GameRegistry registry;
  @Inject UserGameStatsRepository gameStats;
  @Inject SynchronousTransactionManager<Connection> tx;

  private record Session(String id, String cookie, String username) {}

  @SuppressWarnings("unchecked")
  private Session register() {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", "pf_" + u, "email", "pf" + u + "@mail.com", "password", "0123456789")), Map.class);
    var cookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    return new Session((String) ((Map<String, Object>) res.body().get("user")).get("id"), cookie, "pf_" + u);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> profile(Session s) {
    var res = client.toBlocking().exchange(HttpRequest.GET("/api/auth/profile").header("Cookie", s.cookie()), Map.class);
    return (Map<String, Object>) res.body().get("profile");
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> map(Object o) {
    return (Map<String, Object>) o;
  }

  @Test
  void profileRequiresUser() {
    var anon = assertThrows(HttpClientResponseException.class,
        () -> client.toBlocking().exchange(HttpRequest.GET("/api/auth/profile"), Map.class));
    assertEquals(HttpStatus.UNAUTHORIZED, anon.getStatus());
    assertEquals(Map.of("error", "Registered account required"), anon.getResponse().getBody(Map.class).orElseThrow());

    var guest = client.toBlocking().exchange(
        HttpRequest.POST("/api/auth/guest", Map.of("displayName", "Invitado")), Map.class);
    var cookie = guest.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    var e = assertThrows(HttpClientResponseException.class,
        () -> client.toBlocking().exchange(HttpRequest.GET("/api/auth/profile").header("Cookie", cookie), Map.class));
    assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus());
    assertEquals(Map.of("error", "Registered account required"), e.getResponse().getBody(Map.class).orElseThrow());
  }

  @Test
  @SuppressWarnings("unchecked")
  void profileListsAllGamesWithZeros() {
    var s = register();
    var profile = profile(s);
    var user = map(profile.get("user"));
    assertEquals(s.id(), user.get("id"));
    assertEquals(s.username(), user.get("username"));
    assertEquals(Map.of("type", "DEFAULT"), user.get("avatar"));
    assertTrue(((String) user.get("createdAt")).matches("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$"),
        (String) user.get("createdAt"));
    assertEquals(Map.of("gamesPlayed", 0, "gamesWon", 0, "totalPoints", 0), profile.get("globalStats"));
    var games = (List<Map<String, Object>>) profile.get("games");
    assertEquals(28, games.size());
    assertEquals(registry.manifests().get(0).id(), games.get(0).get("id"));
    assertFalse(games.get(0).containsKey("defaultConfig"));
    for (var game : games) {
      assertEquals(Map.of("gameId", game.get("id"), "gamesPlayed", 0, "gamesWon", 0, "points", 0, "metrics", Map.of()),
          game.get("stats"));
    }
  }

  @Test
  void profileAndProgressExposeLevelAndExperience() {
    var s = register();
    var zero = Map.of("level", 1, "xp", 0, "levelXp", 0, "nextLevelXp", 100);
    assertEquals(zero, profile(s).get("progress"));
    assertEquals(zero, progress(s));
    tx.executeWrite(status -> {
      try (var st = status.getConnection().prepareStatement("UPDATE \"UserStats\" SET xp = 260 WHERE \"userId\" = ?")) {
        st.setString(1, s.id());
        assertEquals(1, st.executeUpdate());
        return null;
      } catch (java.sql.SQLException e) {
        throw new IllegalStateException(e);
      }
    });
    var level3 = Map.of("level", 3, "xp", 260, "levelXp", 250, "nextLevelXp", 450);
    assertEquals(level3, profile(s).get("progress"));
    assertEquals(level3, progress(s));
  }

  @Test
  void progressRequiresUser() {
    var anon = assertThrows(HttpClientResponseException.class,
        () -> client.toBlocking().exchange(HttpRequest.GET("/api/auth/progress"), Map.class));
    assertEquals(HttpStatus.UNAUTHORIZED, anon.getStatus());
    var guest = client.toBlocking().exchange(
        HttpRequest.POST("/api/auth/guest", Map.of("displayName", "Invitado")), Map.class);
    var cookie = guest.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    var e = assertThrows(HttpClientResponseException.class,
        () -> client.toBlocking().exchange(HttpRequest.GET("/api/auth/progress").header("Cookie", cookie), Map.class));
    assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus());
    assertEquals(Map.of("error", "Registered account required"), e.getResponse().getBody(Map.class).orElseThrow());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> progress(Session s) {
    var res = client.toBlocking().exchange(HttpRequest.GET("/api/auth/progress").header("Cookie", s.cookie()), Map.class);
    return (Map<String, Object>) res.body().get("progress");
  }

  @Test
  @SuppressWarnings("unchecked")
  void profileMergesStoredStats() {
    var s = register();
    var gameId = registry.manifests().get(0).id();
    gameStats.save(UserGameStatsEntity.create(UUID.randomUUID().toString(), s.id(), gameId, 5, 2, 40,
        Map.of("correct", 3, "text", "x")));
    var games = (List<Map<String, Object>>) profile(s).get("games");
    assertEquals(Map.of("gameId", gameId, "gamesPlayed", 5, "gamesWon", 2, "points", 40, "metrics", Map.of("correct", 3)),
        games.get(0).get("stats"));
    assertEquals(0, map(games.get(1).get("stats")).get("gamesPlayed"));
  }

  /**
   * El porcentaje de victorias se calcula en la web como {@code gamesWon / (gamesPlayed − unrankedGamesPlayed)}: el
   * perfil tiene que mandar la métrica de partidas sin clasificar de Type Duel y declararla en sus {@code profileStats}.
   */
  @Test
  @SuppressWarnings("unchecked")
  void profileSendsTheUnrankedGamesPlayedOfTypeDuel() {
    var s = register();
    gameStats.save(UserGameStatsEntity.create(UUID.randomUUID().toString(), s.id(), "type-duel", 3, 1, 9,
        Map.of("duelsPlayed", 2, "coopGamesPlayed", 1, "unrankedGamesPlayed", 1)));
    var games = (List<Map<String, Object>>) profile(s).get("games");
    var typeDuel = games.stream().filter(g -> "type-duel".equals(g.get("id"))).findFirst().orElseThrow();
    var stats = map(typeDuel.get("stats"));
    assertEquals(3, stats.get("gamesPlayed"));
    assertEquals(1, stats.get("gamesWon"));
    assertEquals(1, map(stats.get("metrics")).get("unrankedGamesPlayed"));
    var declared = (List<Map<String, Object>>) map(typeDuel.get("profileStats")).get("metrics");
    var unranked = declared.stream().filter(m -> "unrankedGamesPlayed".equals(m.get("key"))).findFirst().orElseThrow();
    assertEquals("SUM", unranked.get("aggregation"));
  }

  @Test
  void customAvatarIsExposedWithVersion() {
    var s = register();
    var file = "123e4567-e89b-12d3-a456-426614174000.webp";
    tx.executeWrite(status -> {
      try (var st = status.getConnection().prepareStatement(
          "UPDATE \"User\" SET \"avatarType\"='CUSTOM', \"avatarValue\"=?, \"avatarVersion\"=7 WHERE id=?")) {
        st.setString(1, file);
        st.setString(2, s.id());
        assertEquals(1, st.executeUpdate());
        return null;
      } catch (java.sql.SQLException e) {
        throw new IllegalStateException(e);
      }
    });
    assertEquals(Map.of("type", "CUSTOM", "value", file, "version", 7), map(profile(s).get("user")).get("avatar"));
  }
}

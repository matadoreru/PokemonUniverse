package es.pokemonuniverse.adapters.in.rest.daily;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.DailyChallengeRepository;
import es.pokemonuniverse.adapters.out.persistence.DailyResultRepository;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.domain.daily.CatalogFingerprint;
import es.pokemonuniverse.domain.daily.DailyCalendar;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Rutas REST del reto diario: solo cuentas registradas, 403 antes de jugar y nunca el contenido de la partida. */
@MicronautTest(transactional = false)
class DailyControllerTest {

  private static final Set<String> DAILY_GAMES = Set.of("pokedex-distance", "shiny-vote", "higher-lower",
      "learnset-guess");
  private static final Set<String> CONTENT_KEYS = Set.of("target", "pokemonId", "category", "pokemonIds");

  @Inject @Client("/") HttpClient client;
  @Inject DailyChallengeRepository challenges;
  @Inject DailyResultRepository results;
  @Inject UserRepository users;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

  private final List<String> createdUsers = new ArrayList<>();

  private record Account(String id, String cookie) {}

  @AfterEach
  void cleanUp() throws SQLException {
    // Borrar la cuenta borra en cascada sus filas de DailyResult. Después se quita la fila de hoy de DailyChallenge que
    // (y la de ayer) fijó la prueba, salvo que otra cuenta tenga un intento de hoy (la clave ajena no cae en cascada).
    createdUsers.forEach(id -> users.deleteById(id));
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement("DELETE FROM \"DailyChallenge\" c WHERE c.\"date\" = ?"
            + " AND NOT EXISTS (SELECT 1 FROM \"DailyResult\" r WHERE r.\"date\" = c.\"date\")")) {
      var today = DailyCalendar.dateAt(System.currentTimeMillis());
      for (var day : List.of(today, today.minusDays(1))) {
        statement.setObject(1, day);
        statement.executeUpdate();
      }
    }
  }

  @SuppressWarnings("unchecked")
  private Account register() {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", "dy_" + u, "email", "dy" + u + "@mail.com", "password", "0123456789")), Map.class);
    var cookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    var id = (String) ((Map<String, Object>) res.body().get("user")).get("id");
    createdUsers.add(id);
    return new Account(id, cookie);
  }

  private Account guest() {
    var res = client.toBlocking().exchange(
        HttpRequest.POST("/api/auth/guest", Map.of("displayName", "Invitado")), Map.class);
    var cookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    return new Account("g", cookie);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(String path, Account as) {
    MutableHttpRequest<?> request = HttpRequest.GET(path);
    if (as != null) request.header("Cookie", as.cookie());
    return client.toBlocking().retrieve(request, Map.class);
  }

  private String raw(String path, Account as) {
    MutableHttpRequest<?> request = HttpRequest.GET(path);
    request.header("Cookie", as.cookie());
    return client.toBlocking().retrieve(request, String.class);
  }

  private HttpClientResponseException fails(String path, Account as) {
    return assertThrows(HttpClientResponseException.class, () -> get(path, as));
  }

  /** Simula haber terminado el reto de hoy: fija el día si nadie lo ha hecho y guarda una fila FINISHED. */
  private LocalDate finishToday(Account account, int score, int correct) {
    return finishOn(DailyCalendar.dateAt(System.currentTimeMillis()), account, score, correct);
  }

  private LocalDate finishOn(LocalDate today, Account account, int score, int correct) {
    var ids = List.of("pikachu", "bulbasaur");
    challenges.insertIfAbsent(today, "higher-lower", "[\"pikachu\",\"bulbasaur\"]", CatalogFingerprint.of(ids));
    var gameId = challenges.findById(today).orElseThrow().getGameId();
    var rowId = UUID.randomUUID().toString();
    assertEquals(1, results.insertStarted(rowId, account.id(), today, gameId, Instant.now()));
    assertEquals(1, results.finish(rowId, score, correct, "[1,0,1]", Instant.now()));
    return today;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> map(Object o) {
    return (Map<String, Object>) o;
  }

  @Test
  void guestGets401OnEveryRoute() {
    var guest = guest();
    for (var path : List.of("/api/daily", "/api/daily/leaderboard")) {
      for (Account as : new Account[] {null, guest}) {
        var e = fails(path, as);
        assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus(), path);
        assertEquals(Map.of("error", "Registered account required"), e.getResponse().getBody(Map.class).orElseThrow());
      }
    }
  }

  @Test
  void overviewBeforeAndAfterPlaying() {
    var ash = register();
    var before = get("/api/daily", ash);
    assertEquals("AVAILABLE", before.get("status"));
    assertTrue(before.containsKey("result"), "result viaja presente aunque sea null");
    assertNull(before.get("result"));
    var date = (String) before.get("date");
    assertTrue(date.matches("\\d{4}-\\d{2}-\\d{2}"), date);
    assertTrue(Instant.parse((String) before.get("resetsAt")).isAfter(Instant.now()));
    assertTrue(before.get("name") instanceof String name && !name.isBlank());
    assertTrue(before.get("icon") instanceof String);

    var today = finishToday(ash, 2_500, 2);
    var after = get("/api/daily", ash);
    assertEquals(today.toString(), after.get("date"));
    assertEquals("FINISHED", after.get("status"));
    var result = map(after.get("result"));
    assertEquals(2_500, result.get("score"));
    assertEquals(2, result.get("correct"));
    assertEquals(List.of(1, 0, 1), result.get("rounds"));
    assertEquals(after.get("roundCount"), result.get("roundCount"));
    assertInstanceOf(Integer.class, result.get("position"));
    assertTrue(((Number) result.get("total")).longValue() >= 1);
    assertTrue(((Number) after.get("players")).longValue() >= 1);
  }

  @Test
  void leaderboardIs403BeforePlaying() {
    var misty = register();
    var e = fails("/api/daily/leaderboard", misty);
    assertEquals(HttpStatus.FORBIDDEN, e.getStatus());
    assertEquals(Map.of("error", "Play today's challenge first"), e.getResponse().getBody(Map.class).orElseThrow());

    var today = finishToday(misty, 1_000_000, 3);
    var board = get("/api/daily/leaderboard", misty);
    assertEquals(today.toString(), board.get("date"));
    assertTrue(DAILY_GAMES.contains((String) board.get("gameId")));
    @SuppressWarnings("unchecked")
    var entries = (List<Map<String, Object>>) board.get("entries");
    var mine = entries.stream().filter(entry -> misty.id().equals(entry.get("userId"))).findFirst().orElseThrow();
    assertEquals(1_000_000, mine.get("score"));
    assertTrue(mine.get("username") instanceof String);
    assertTrue(mine.get("avatar") instanceof Map);
    Instant.parse((String) mine.get("finishedAt"));
    var me = map(board.get("me"));
    assertEquals("FINISHED", me.get("status"));
    assertEquals(mine.get("position"), me.get("position"));
    assertEquals(List.of(1, 0, 1), me.get("rounds"));
  }

  @Test
  void leaderboardOfThePlayedDay() {
    // Una partida que cruzó la medianoche de Madrid: la fila es de ayer y hoy no hay intento.
    var ash = register();
    var yesterday = finishOn(DailyCalendar.dateAt(System.currentTimeMillis()).minusDays(1), ash, 3_000, 2);
    assertEquals(HttpStatus.FORBIDDEN, fails("/api/daily/leaderboard", ash).getStatus());
    var board = get("/api/daily/leaderboard?date=" + yesterday, ash);
    assertEquals(yesterday.toString(), board.get("date"));
    var me = map(board.get("me"));
    assertEquals("FINISHED", me.get("status"));
    assertEquals(3_000, me.get("score"));

    var e = fails("/api/daily/leaderboard?date=" + yesterday.minusDays(1), ash);
    assertEquals(HttpStatus.FORBIDDEN, e.getStatus());
    assertEquals(Map.of("error", "Play today's challenge first"), e.getResponse().getBody(Map.class).orElseThrow());
    assertEquals(HttpStatus.FORBIDDEN, fails("/api/daily/leaderboard?date=" + yesterday, register()).getStatus());

    for (var bad : List.of("ayer", "2026-02-30", "2026-1-05", "20261105")) {
      var malformed = fails("/api/daily/leaderboard?date=" + bad, ash);
      assertEquals(HttpStatus.BAD_REQUEST, malformed.getStatus(), bad);
      assertEquals(Map.of("error", "Invalid date"), malformed.getResponse().getBody(Map.class).orElseThrow());
    }
  }

  @Test
  void overviewShowsTodaysSingleGame() {
    var brock = register();
    var overview = get("/api/daily", brock);
    assertInstanceOf(String.class, overview.get("gameId"));
    assertTrue(DAILY_GAMES.contains((String) overview.get("gameId")));
    assertFalse(overview.containsKey("games"), "un solo reto al día: no hay lista de juegos");
    assertEquals(Set.of("date", "resetsAt", "gameId", "name", "icon", "roundCount", "players", "status", "result"),
        overview.keySet());
  }

  @Test
  void responsesNeverContainContent() {
    var gary = register();
    finishToday(gary, 10, 1);
    for (var path : List.of("/api/daily", "/api/daily/leaderboard")) {
      var body = raw(path, gary);
      for (var key : CONTENT_KEYS) assertFalse(body.contains("\"" + key + "\""), path + " contiene " + key);
    }
  }
}

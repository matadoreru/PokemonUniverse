package es.pokemonuniverse.adapters.in.rest.admin;

import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.body;
import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Rutas de lectura de {@code admin/routes.ts} con datos sembrados: forma y orden de claves, orden de filas, filtros,
 * búsqueda {@code ILIKE} sin escapar comodines (como Prisma), paginación y 400 con {@code issues}; y el 503 del
 * data-sync con {@code pu.data-sync.enabled=false} (el valor por defecto).
 */
@MicronautTest(transactional = false)
class AdminReadRoutesTest {

  private static final String ISO = "\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z";

  @Inject @Client("/") HttpClient client;
  @Inject IdentityTokens tokens;
  @Inject ObjectMapper mapper;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;
  @Inject GameRegistry registry;
  @Inject RoomCoordinator coordinator;

  private AdminTestSupport support;
  private AdminTestSupport.Account admin;
  private String tag;

  @BeforeEach
  void setUp() throws Exception {
    support = new AdminTestSupport(client, tokens, mapper, dataSource, resolver);
    admin = support.admin();
    tag = AdminTestSupport.tag();
  }

  /** La BD de test-resources sobrevive entre ejecuciones: se borra lo sembrado con la etiqueta de la prueba. */
  @AfterEach
  void removeSeeds() throws Exception {
    var suffix = "%" + tag;
    support.execute("DELETE FROM \"GameHistory\" WHERE id LIKE ? OR \"roomCode\" LIKE ?", suffix, suffix + "%");
    support.execute("DELETE FROM \"RoomHistory\" WHERE id LIKE ? OR \"hostDisplayName\" LIKE ?", suffix,
        suffix + "%");
    support.execute("DELETE FROM \"User\" WHERE username LIKE ?", suffix);
  }

  /** Marca de tiempo UTC para columnas {@code timestamp(3)} sin zona (como escribe Prisma). */
  private static LocalDateTime at(String iso) {
    return LocalDateTime.parse(iso);
  }

  private void room(String id, String code, String host, String status, String closeReason, String createdAt,
      String endedAt) throws Exception {
    support.execute("INSERT INTO \"RoomHistory\" (id, \"roomCode\", \"hostUserId\", \"hostDisplayName\", "
        + "\"maxPlayers\", status, \"closeReason\", \"createdAt\", \"endedAt\", \"updatedAt\") "
        + "VALUES (?, ?, NULL, ?, 8, ?::\"RoomHistoryStatus\", ?, ?, ?, ?)", id, code, host, status, closeReason,
        at(createdAt), endedAt == null ? null : at(endedAt), at(createdAt));
  }

  private void game(String id, String roomId, String code, String gameId, String status, String startedAt,
      String endedAt) throws Exception {
    support.execute("INSERT INTO \"GameHistory\" (id, \"resultId\", \"roomHistoryId\", \"roomCode\", \"gameId\", "
        + "\"playerCount\", config, status, \"startedAt\", \"endedAt\") VALUES (?, ?, ?, ?, ?, 2, '{}'::jsonb, "
        + "?::\"GameHistoryStatus\", ?, ?)", id, "res-" + id, roomId, code, gameId, status, at(startedAt),
        endedAt == null ? null : at(endedAt));
  }

  private void result(String historyId, String userId, String name, int position, int points) throws Exception {
    support.execute("INSERT INTO \"PlayerGameResult\" (id, \"historyId\", \"userId\", \"displayName\", position, "
        + "points, metrics) VALUES (?, ?, ?, ?, ?, ?, '{}'::jsonb)", UUID.randomUUID().toString(), historyId, userId,
        name, position, points);
  }

  private String get(String path) {
    return support.get(path, admin.cookie());
  }

  private static String enc(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  @Test
  void roomsAreNewestFirstWithGamesStartedAndExplicitNulls() throws Exception {
    var upper = tag.toUpperCase();
    room("a-" + tag, "AA" + upper, "Host " + tag, "CLOSED", "EMPTY", "2026-01-01T10:00:00.123", "2026-01-01T11:00:00");
    room("b-" + tag, "QQQQQQ", "BROCK " + upper, "ACTIVE", null, "2026-01-02T10:00:00", null);
    game("ga-" + tag, "a-" + tag, "AA" + upper, "higher-lower", "COMPLETED", "2026-01-01T10:10:00", null);
    game("gb-" + tag, "a-" + tag, "AA" + upper, "higher-lower", "ABANDONED", "2026-01-01T10:20:00", null);

    assertEquals("{\"items\":[{\"id\":\"b-" + tag + "\",\"code\":\"QQQQQQ\",\"hostDisplayName\":\"BROCK " + upper
        + "\",\"hostUserId\":null,\"maxPlayers\":8,\"status\":\"ACTIVE\",\"closeReason\":null,\"gamesStarted\":0,"
        + "\"createdAt\":\"2026-01-02T10:00:00.000Z\",\"endedAt\":null},{\"id\":\"a-" + tag + "\",\"code\":\"AA"
        + upper + "\",\"hostDisplayName\":\"Host " + tag + "\",\"hostUserId\":null,\"maxPlayers\":8,\"status\":"
        + "\"CLOSED\",\"closeReason\":\"EMPTY\",\"gamesStarted\":2,\"createdAt\":\"2026-01-01T10:00:00.123Z\","
        + "\"endedAt\":\"2026-01-01T11:00:00.000Z\"}],\"page\":1,\"pageSize\":20,\"total\":2,\"totalPages\":1}",
        get("/api/admin/rooms?search=" + tag));
    assertTrue(get("/api/admin/rooms?status=CLOSED&search=" + tag).contains("\"total\":1,"));
    // Comodines sin escapar, como Prisma: '_' casa con cualquier carácter.
    var wildcard = tag.charAt(0) + "_" + tag.substring(2);
    assertTrue(get("/api/admin/rooms?search=" + wildcard).contains("\"total\":2,"));
    assertEquals("{\"items\":[],\"page\":99,\"pageSize\":20,\"total\":2,\"totalPages\":1}",
        get("/api/admin/rooms?page=99&search=" + tag));
  }

  @Test
  void gamesMatchRoomCodeOrAnyParticipantWithoutDuplicates() throws Exception {
    var user = support.register("gm_" + tag, "gm" + tag + "@mail.com");
    room("r-" + tag, "RRRRRR", "Host", "CLOSED", "EMPTY", "2026-01-01T09:00:00", "2026-01-01T12:00:00");
    game("g1-" + tag, "r-" + tag, "XXXXXX", "higher-lower", "COMPLETED", "2026-01-01T10:10:00", "2026-01-01T10:20:00");
    result("g1-" + tag, null, "Gary " + tag, 2, 5);
    result("g1-" + tag, user.id(), "Ash " + tag, 1, 10);
    game("g2-" + tag, "r-" + tag, "Z" + tag, "juego-retirado", "INTERRUPTED", "2026-01-01T10:30:00", null);

    var name = registry.get("higher-lower").orElseThrow().name();
    assertEquals("{\"items\":[{\"id\":\"g2-" + tag + "\",\"roomCode\":\"Z" + tag + "\",\"gameId\":\"juego-retirado\","
        + "\"gameName\":\"juego-retirado\",\"playerCount\":2,\"status\":\"INTERRUPTED\",\"startedAt\":"
        + "\"2026-01-01T10:30:00.000Z\",\"endedAt\":null,\"participants\":[]},{\"id\":\"g1-" + tag + "\",\"roomCode\":"
        + "\"XXXXXX\",\"gameId\":\"higher-lower\",\"gameName\":\"" + name + "\",\"playerCount\":2,\"status\":"
        + "\"COMPLETED\",\"startedAt\":\"2026-01-01T10:10:00.000Z\",\"endedAt\":\"2026-01-01T10:20:00.000Z\","
        + "\"participants\":[{\"displayName\":\"Ash " + tag + "\",\"userId\":\"" + user.id() + "\",\"position\":1,"
        + "\"points\":10},{\"displayName\":\"Gary " + tag + "\",\"userId\":null,\"position\":2,\"points\":5}]}],"
        + "\"page\":1,\"pageSize\":20,\"total\":2,\"totalPages\":1}", get("/api/admin/games?search=" + tag.toUpperCase()));
    assertTrue(get("/api/admin/games?status=COMPLETED&search=" + tag).contains("\"total\":1,"));
    assertTrue(get("/api/admin/games?gameId=%20higher-lower%20&search=" + tag).contains("\"total\":1,"));
    assertTrue(get("/api/admin/games?gameId=other&search=" + tag).contains("\"total\":0,"));
  }

  @Test
  void usersAreNewestFirstWithStatsOrZeros() throws Exception {
    var older = support.register("u1_" + tag, "mail_u1" + tag + "@x.com");
    var newer = support.register("u2_" + tag, "u2" + tag + "@x.com");
    support.execute("UPDATE \"User\" SET \"createdAt\" = ?, \"updatedAt\" = ? WHERE id = ?",
        at("2030-01-01T00:00:00"), at("2030-01-02T00:00:00"), older.id());
    support.execute("UPDATE \"User\" SET \"createdAt\" = ?, \"updatedAt\" = ? WHERE id = ?",
        at("2031-01-01T00:00:00"), at("2031-01-02T00:00:00"), newer.id());
    support.execute("INSERT INTO \"UserStats\" (\"userId\", \"gamesPlayed\", \"gamesWon\", \"totalPoints\") "
        + "VALUES (?, 4, 1, 37) ON CONFLICT (\"userId\") DO UPDATE SET \"gamesPlayed\" = 4, \"gamesWon\" = 1, "
        + "\"totalPoints\" = 37", older.id());

    assertEquals("{\"items\":[{\"id\":\"" + newer.id() + "\",\"username\":\"u2_" + tag + "\",\"email\":\"u2" + tag
        + "@x.com\",\"role\":\"USER\",\"gamesPlayed\":0,\"gamesWon\":0,\"totalPoints\":0,\"createdAt\":"
        + "\"2031-01-01T00:00:00.000Z\",\"updatedAt\":\"2031-01-02T00:00:00.000Z\"},{\"id\":\"" + older.id()
        + "\",\"username\":\"u1_" + tag + "\",\"email\":\"mail_u1" + tag + "@x.com\",\"role\":\"USER\","
        + "\"gamesPlayed\":4,\"gamesWon\":1,\"totalPoints\":37,\"createdAt\":\"2030-01-01T00:00:00.000Z\","
        + "\"updatedAt\":\"2030-01-02T00:00:00.000Z\"}],\"page\":1,\"pageSize\":20,\"total\":2,\"totalPages\":1}",
        get("/api/admin/users?search=" + tag));
    assertTrue(get("/api/admin/users?search=MAIL_U1" + tag).contains("\"total\":1,"));
    assertTrue(get("/api/admin/users?role=ADMIN&search=" + tag).contains("\"total\":0,"));
    assertTrue(get("/api/admin/users?role=ADMIN&search=" + admin.username()).contains("\"total\":1,"));
  }

  @Test
  void summaryAndActiveRoomsReadTheLiveCoordinator() throws Exception {
    var host = new AuthUser("guest-" + UUID.randomUUID(), "Ñandú " + tag, AuthUser.Kind.GUEST, null, null,
        new AvatarRef.Default());
    var view = coordinator.create(host, "conn-" + tag, null);

    var summary = get("/api/admin/summary");
    assertTrue(summary.matches("\\{\"activeRooms\":\\d+,\"gamesInProgress\":\\d+,\"registeredUsers\":"
        + support.count("SELECT count(*) FROM \"User\"") + ",\"interruptedToday\":\\d+,\"updatedAt\":\"" + ISO + "\"}"),
        summary);

    var active = get("/api/admin/active-rooms?search=" + enc("ÑANDÚ " + tag.toUpperCase()));
    var code = mapper.readValue(mapper.writeValueAsString(view), Map.class).get("code");
    assertTrue(active.matches("\\{\"items\":\\[\\{\"id\":\"[^\"]+\",\"code\":\"" + code + "\",\"phase\":\"LOBBY\","
        + "\"gameId\":null,\"gameName\":null,\"connectedPlayers\":1,\"totalPlayers\":1,\"maxPlayers\":\\d+,"
        + "\"hostDisplayName\":\"Ñandú " + tag + "\",\"createdAt\":\"" + ISO + "\",\"updatedAt\":\"" + ISO + "\","
        + "\"participants\":\\[\\{\"id\":\"" + host.id() + "\",\"displayName\":\"Ñandú " + tag + "\",\"kind\":\"GUEST\","
        + "\"presence\":\"CONNECTED\",\"roomRole\":\"HOST\"}]}],\"page\":1,\"pageSize\":20,\"total\":1,"
        + "\"totalPages\":1}"), active);
  }

  @Test
  void invalidQueriesAre400WithZodIssues() {
    var page = support.fails(HttpRequest.GET("/api/admin/rooms?page=0"), admin.cookie());
    assertEquals(HttpStatus.BAD_REQUEST, page.getStatus());
    assertEquals("{\"error\":\"Too small: expected number to be >=1\",\"issues\":[{\"origin\":\"number\",\"code\":"
        + "\"too_small\",\"minimum\":1,\"inclusive\":true,\"path\":[\"page\"],\"message\":\"Too small: expected number "
        + "to be >=1\"}]}", body(page));
    for (var path : new String[] {"active-rooms", "rooms", "games", "users", "feedback"}) {
      var search = support.fails(HttpRequest.GET("/api/admin/" + path + "?search=" + "x".repeat(81)), admin.cookie());
      assertEquals(HttpStatus.BAD_REQUEST, search.getStatus(), path);
      assertEquals("{\"error\":\"Too big: expected string to have <=80 characters\",\"issues\":[{\"origin\":\"string\","
          + "\"code\":\"too_big\",\"maximum\":80,\"inclusive\":true,\"path\":[\"search\"],\"message\":\"Too big: "
          + "expected string to have <=80 characters\"}]}", body(search), path);
    }
    var role = support.fails(HttpRequest.GET("/api/admin/users?role=OWNER"), admin.cookie());
    assertEquals("{\"error\":\"Invalid option: expected one of \\\"USER\\\"|\\\"ADMIN\\\"\",\"issues\":[{\"code\":"
        + "\"invalid_value\",\"values\":[\"USER\",\"ADMIN\"],\"path\":[\"role\"],\"message\":\"Invalid option: expected "
        + "one of \\\"USER\\\"|\\\"ADMIN\\\"\"}]}", body(role));
    var status = support.fails(HttpRequest.GET("/api/admin/games?status=CLOSED"), admin.cookie());
    assertTrue(body(status).contains("\"values\":[\"IN_PROGRESS\",\"COMPLETED\",\"ABANDONED\",\"INTERRUPTED\"]"),
        body(status));
  }

  @Test
  void dataSyncIs503WhileDisabledBeforeValidatingTheSource() {
    for (var request : new io.micronaut.http.MutableHttpRequest<?>[] {HttpRequest.GET("/api/admin/data-sync"),
        json(HttpRequest.POST("/api/admin/data-sync/bogus", "{}")),
        json(HttpRequest.POST("/api/admin/data-sync/pokemon", "{\"full\":true}"))}) {
      var e = support.fails(request, admin.cookie());
      assertEquals(HttpStatus.SERVICE_UNAVAILABLE, e.getStatus(), request.getPath());
      assertEquals("{\"error\":\"La sincronización de datos no está disponible\"}", body(e));
    }
  }

}

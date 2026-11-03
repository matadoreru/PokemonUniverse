package es.pokemonuniverse.adapters.in.rest.admin;

import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.body;
import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.domain.game.GameRegistry;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.LocalDateTime;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** {@code createAdminFeedbackRouter}: lista paginada con filtros y resumen, y cambio de estado. */
@MicronautTest(transactional = false)
class AdminFeedbackControllerTest {

  private static final String ISO = "\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z";

  @Inject @Client("/") HttpClient client;
  @Inject IdentityTokens tokens;
  @Inject ObjectMapper mapper;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;
  @Inject GameRegistry registry;

  private AdminTestSupport support;
  private AdminTestSupport.Account admin;
  private String tag;

  @BeforeEach
  void setUp() throws Exception {
    support = new AdminTestSupport(client, tokens, mapper, dataSource, resolver);
    admin = support.admin();
    tag = AdminTestSupport.tag();
  }

  private void feedback(String id, String reference, String gameId, String roomCode, String type, String status,
      String description, String author, String createdAt) throws Exception {
    support.execute("INSERT INTO \"Feedback\" (id, reference, \"gameId\", \"roomCode\", type, status, description, "
        + "\"authorUserId\", \"authorDisplayName\", \"authorKind\", \"createdAt\", \"updatedAt\") VALUES (?, "
        + "?::\"FeedbackReference\", ?, ?, ?::\"FeedbackType\", ?::\"FeedbackStatus\", ?, NULL, ?, 'GUEST', ?, ?)",
        id, reference, gameId, roomCode, type, status, description, author, LocalDateTime.parse(createdAt),
        LocalDateTime.parse(createdAt));
  }

  @Test
  void listsNewestFirstWithFiltersAndOverview() throws Exception {
    feedback("f1-" + tag, "MINIGAME", "higher-lower", null, "BUG", "NEW", "Falla algo " + tag, "Ash",
        "2026-01-01T10:00:00");
    feedback("f2-" + tag, "GENERAL", null, "ABCDEF", "SUGGESTION", "REVIEWING", "Una idea", "Misty " + tag.toUpperCase(),
        "2026-01-02T10:00:00");
    var name = registry.get("higher-lower").orElseThrow().name();
    var list = support.get("/api/admin/feedback?search=" + tag, admin.cookie());
    assertTrue(list.matches("\\{\"items\":\\[\\{\"id\":\"f2-" + tag + "\",\"reference\":\"GENERAL\",\"gameId\":null,"
        + "\"gameName\":null,\"roomCode\":\"ABCDEF\",\"type\":\"SUGGESTION\",\"status\":\"REVIEWING\",\"description\":"
        + "\"Una idea\",\"author\":\\{\"userId\":null,\"displayName\":\"Misty " + tag.toUpperCase() + "\",\"kind\":"
        + "\"GUEST\"},\"createdAt\":\"2026-01-02T10:00:00.000Z\",\"updatedAt\":\"2026-01-02T10:00:00.000Z\"},"
        + "\\{\"id\":\"f1-" + tag + "\",\"reference\":\"MINIGAME\",\"gameId\":\"higher-lower\",\"gameName\":\""
        + name + "\",\"roomCode\":null,\"type\":\"BUG\",\"status\":\"NEW\",\"description\":\"Falla algo " + tag
        + "\",\"author\":\\{\"userId\":null,\"displayName\":\"Ash\",\"kind\":\"GUEST\"},\"createdAt\":"
        + "\"2026-01-01T10:00:00.000Z\",\"updatedAt\":\"2026-01-01T10:00:00.000Z\"}],\"page\":1,\"pageSize\":20,"
        + "\"total\":2,\"totalPages\":1,\"overview\":\\{\"newBugs\":\\d+,\"newSuggestions\":\\d+,\"reviewing\":\\d+,"
        + "\"resolved\":\\d+}}"), list);
    for (var filter : new String[] {"reference=MINIGAME", "status=NEW", "type=BUG"}) {
      assertTrue(support.get("/api/admin/feedback?" + filter + "&search=" + tag, admin.cookie())
          .contains("\"total\":1,"), filter);
    }
    var invalid = support.fails(HttpRequest.GET("/api/admin/feedback?reference=X&status=Y&type=Z"), admin.cookie());
    assertEquals(HttpStatus.BAD_REQUEST, invalid.getStatus());
    assertTrue(body(invalid).contains("\"path\":[\"reference\"]") && body(invalid).contains("\"path\":[\"status\"]")
        && body(invalid).indexOf("\"path\":[\"status\"]") < body(invalid).indexOf("\"path\":[\"type\"]"), body(invalid));
  }

  @Test
  void updatesTheStatusAndTouchesUpdatedAt() throws Exception {
    feedback("f3-" + tag, "GENERAL", null, null, "BUG", "NEW", "Otra cosa", "Brock", "2026-01-01T10:00:00");
    var res = support.send(json(HttpRequest.PATCH("/api/admin/feedback/f3-" + tag + "/status",
        "{\"status\":\"RESOLVED\"}")), admin.cookie());
    assertEquals(HttpStatus.OK, res.getStatus());
    assertTrue(res.body().matches("\\{\"feedback\":\\{\"id\":\"f3-" + tag + "\",.*\"status\":\"RESOLVED\",.*"
        + "\"createdAt\":\"2026-01-01T10:00:00.000Z\",\"updatedAt\":\"" + ISO + "\"}}"), res.body());
    assertTrue(!res.body().contains("\"updatedAt\":\"2026-01-01T10:00:00.000Z\""), res.body());

    var missing = support.fails(json(HttpRequest.PATCH("/api/admin/feedback/missing/status",
        "{\"status\":\"NEW\"}")), admin.cookie());
    assertEquals(HttpStatus.NOT_FOUND, missing.getStatus());
    assertEquals("{\"error\":\"Feedback no encontrado.\"}", body(missing));

    // El cuerpo se valida antes que el id.
    var invalid = support.fails(json(HttpRequest.PATCH("/api/admin/feedback/" + "x".repeat(129) + "/status",
        "{\"status\":\"X\",\"y\":1}")), admin.cookie());
    assertEquals("{\"error\":\"Invalid option: expected one of \\\"NEW\\\"|\\\"REVIEWING\\\"|\\\"RESOLVED\\\"\","
        + "\"issues\":[{\"code\":\"invalid_value\",\"values\":[\"NEW\",\"REVIEWING\",\"RESOLVED\"],\"path\":[\"status\"],"
        + "\"message\":\"Invalid option: expected one of \\\"NEW\\\"|\\\"REVIEWING\\\"|\\\"RESOLVED\\\"\"},{\"code\":"
        + "\"unrecognized_keys\",\"keys\":[\"y\"],\"path\":[],\"message\":\"Unrecognized key: \\\"y\\\"\"}]}",
        body(invalid));
    var longId = support.fails(json(HttpRequest.PATCH("/api/admin/feedback/" + "x".repeat(129) + "/status",
        "{\"status\":\"NEW\"}")), admin.cookie());
    assertTrue(body(longId).startsWith("{\"error\":\"Too big: expected string to have <=128 characters\""),
        body(longId));
  }
}

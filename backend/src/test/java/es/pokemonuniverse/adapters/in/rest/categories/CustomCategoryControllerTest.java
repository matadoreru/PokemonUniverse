package es.pokemonuniverse.adapters.in.rest.categories;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.in.ws.WsRoomEvents;
import es.pokemonuniverse.adapters.out.persistence.CustomCategoryEntity;
import es.pokemonuniverse.adapters.out.persistence.CustomCategoryRepository;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.categories.CustomCategoryService;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.rooms.RoomEvents;
import es.pokemonuniverse.application.rooms.RoomView;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.MutableHttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;

/** Rutas de {@code apps/server/src/categories/routes.ts}: códigos, cuerpos exactos y el aviso a las salas. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "CustomCategoryControllerTest")
class CustomCategoryControllerTest {

  private static final String ISO = "\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z";

  /** Recoge los {@code room:state} que el coordinador real emitiría por WebSocket. */
  @Singleton
  @Requires(property = "spec.name", value = "CustomCategoryControllerTest")
  @Replaces(WsRoomEvents.class)
  static class RecordingEvents implements RoomEvents {
    record Sent(String memberId, String event, Object payload) {}

    final List<Sent> sent = new CopyOnWriteArrayList<>();

    @Override
    public void sendToMember(String memberId, String connectionId, String event, Object payload) {
      sent.add(new Sent(memberId, event, payload));
    }

    @Override
    public void kick(String memberId, String connectionId, String reason) {}
  }

  @Inject @Client("/") HttpClient client;
  @Inject IdentityTokens tokens;
  @Inject ObjectMapper mapper;
  @Inject CustomCategoryRepository repository;
  @Inject RoomCoordinator coordinator;
  @Inject RecordingEvents events;
  @Inject CustomCategoryService categories;
  @Inject javax.sql.DataSource dataSource;
  @Inject io.micronaut.jdbc.DataSourceResolver resolver;

  private record Account(String id, String cookie) {}

  /** Usuario real: la FK de userId exige que exista en "User". */
  @SuppressWarnings("unchecked")
  private Account register() throws Exception {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", "cc_" + u, "email", "cc" + u + "@mail.com", "password", "0123456789")), String.class);
    var cookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
    var user = (Map<String, Object>) mapper.readValue(res.body(), Map.class).get("user");
    return new Account((String) user.get("id"), cookie);
  }

  private String guestCookie() {
    var guest = new AuthUser("guest-" + UUID.randomUUID(), "Ash", AuthUser.Kind.GUEST, null, null, new AvatarRef.Default());
    return "pu_session=" + tokens.sign(guest, Instant.now());
  }

  private HttpResponse<String> send(MutableHttpRequest<?> request, @Nullable String cookie) {
    if (cookie != null) request.header("Cookie", cookie);
    return client.toBlocking().exchange(request, String.class);
  }

  private static MutableHttpRequest<String> json(MutableHttpRequest<String> request) {
    return request.contentType(MediaType.APPLICATION_JSON_TYPE);
  }

  private HttpClientResponseException fails(MutableHttpRequest<?> request, @Nullable String cookie) {
    return assertThrows(HttpClientResponseException.class, () -> send(request, cookie));
  }

  private static String body(HttpClientResponseException e) {
    return e.getResponse().getBody(String.class).orElseThrow();
  }

  @SuppressWarnings("unchecked")
  private String createdId(HttpResponse<String> res) throws Exception {
    return (String) ((Map<String, Object>) mapper.readValue(res.body(), Map.class).get("category")).get("id");
  }

  @Test
  void anonymousAndGuestsAre401OnEveryRoute() {
    for (var cookie : new String[] {null, guestCookie()}) {
      for (var request : List.<MutableHttpRequest<?>>of(
          HttpRequest.GET("/api/categories"),
          json(HttpRequest.POST("/api/categories", "{\"text\":\"abcd\",\"foo\":1}")),
          json(HttpRequest.PATCH("/api/categories/x", "{}")),
          HttpRequest.DELETE("/api/categories/x"))) {
        var e = fails(request, cookie);
        assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus());
        assertEquals("{\"error\":\"Registered account required\"}", body(e));
      }
    }
  }

  @Test
  void createsListsUpdatesAndDeletes() throws Exception {
    var account = register();
    var created = send(json(HttpRequest.POST("/api/categories", "{\"text\":\"  Pokémon para el gimnasio \"}")),
        account.cookie());
    assertEquals(HttpStatus.CREATED, created.getStatus());
    var id = createdId(created);
    assertTrue(created.body().matches("\\{\"category\":\\{\"id\":\"" + id + "\",\"text\":\"Pokémon para el gimnasio\","
        + "\"enabled\":true,\"createdAt\":\"" + ISO + "\",\"updatedAt\":\"" + ISO + "\"}}"), created.body());

    var listed = send(HttpRequest.GET("/api/categories"), account.cookie());
    assertTrue(listed.body().matches("\\{\"categories\":\\[\\{\"id\":\"" + id + "\",\"text\":\"Pokémon para el gimnasio\","
        + "\"enabled\":true,\"createdAt\":\"" + ISO + "\",\"updatedAt\":\"" + ISO + "\"}]}"), listed.body());

    var updated = send(json(HttpRequest.PATCH("/api/categories/" + id, "{\"enabled\":false}")), account.cookie());
    assertEquals(HttpStatus.OK, updated.getStatus());
    assertTrue(updated.body().contains("\"enabled\":false"), updated.body());
    assertEquals(false, repository.findById(id).orElseThrow().isEnabled());

    var deleted = send(HttpRequest.DELETE("/api/categories/" + id), account.cookie());
    assertEquals(HttpStatus.NO_CONTENT, deleted.getStatus());
    assertTrue(repository.findById(id).isEmpty());
    var again = fails(HttpRequest.DELETE("/api/categories/" + id), account.cookie());
    assertEquals(HttpStatus.NOT_FOUND, again.getStatus());
    assertEquals("{\"error\":\"Categoría no encontrada.\"}", body(again));
  }

  @Test
  void validationErrorsCarryZodIssues() throws Exception {
    var account = register();
    var unknown = fails(json(HttpRequest.POST("/api/categories", "{\"text\":\"abcd\",\"foo\":1}")), account.cookie());
    assertEquals(HttpStatus.BAD_REQUEST, unknown.getStatus());
    assertEquals("{\"error\":\"Unrecognized key: \\\"foo\\\"\",\"issues\":[{\"code\":\"unrecognized_keys\","
        + "\"keys\":[\"foo\"],\"path\":[],\"message\":\"Unrecognized key: \\\"foo\\\"\"}]}", body(unknown));

    var shortText = fails(json(HttpRequest.POST("/api/categories", "{\"text\":\"abc\"}")), account.cookie());
    assertEquals("{\"error\":\"Escribe al menos 4 caracteres.\",\"issues\":[{\"origin\":\"string\",\"code\":\"too_small\","
        + "\"minimum\":4,\"inclusive\":true,\"path\":[\"text\"],\"message\":\"Escribe al menos 4 caracteres.\"}]}",
        body(shortText));

    var longText = fails(json(HttpRequest.POST("/api/categories", "{\"text\":\"" + "a".repeat(161) + "\"}")),
        account.cookie());
    assertTrue(body(longText).startsWith("{\"error\":\"La categoría no puede superar 160 caracteres.\""), body(longText));

    var id = createdId(send(json(HttpRequest.POST("/api/categories", "{\"text\":\"Pokémon para cocinar\"}")),
        account.cookie()));
    var empty = fails(json(HttpRequest.PATCH("/api/categories/" + id, "{}")), account.cookie());
    assertEquals(HttpStatus.BAD_REQUEST, empty.getStatus());
    assertEquals("{\"error\":\"No hay cambios que guardar.\",\"issues\":[{\"code\":\"custom\",\"path\":[],"
        + "\"message\":\"No hay cambios que guardar.\"}]}", body(empty));

    var notObject = fails(json(HttpRequest.POST("/api/categories", "[]")), account.cookie());
    assertTrue(body(notObject).startsWith("{\"error\":\"Invalid input: expected object, received array\""),
        body(notObject));

    var longId = fails(json(HttpRequest.PATCH("/api/categories/" + "x".repeat(129), "{}")), account.cookie());
    assertEquals("{\"error\":\"Too big: expected string to have <=128 characters\",\"issues\":[{\"origin\":\"string\","
        + "\"code\":\"too_big\",\"maximum\":128,\"inclusive\":true,\"path\":[],"
        + "\"message\":\"Too big: expected string to have <=128 characters\"}]}", body(longId));
  }

  @Test
  void missingBodyIsAnEmptyObjectLikeExpress() throws Exception {
    var account = register();
    var post = fails(HttpRequest.POST("/api/categories", ""), account.cookie());
    assertEquals(HttpStatus.BAD_REQUEST, post.getStatus());
    assertEquals("{\"error\":\"Invalid input: expected string, received undefined\",\"issues\":[{\"expected\":\"string\","
        + "\"code\":\"invalid_type\",\"path\":[\"text\"],\"message\":\"Invalid input: expected string, received undefined\"}]}",
        body(post));
    var id = createdId(send(json(HttpRequest.POST("/api/categories", "{\"text\":\"Pokémon sin cuerpo\"}")),
        account.cookie()));
    var patch = fails(HttpRequest.PATCH("/api/categories/" + id, ""), account.cookie());
    assertEquals("{\"error\":\"No hay cambios que guardar.\",\"issues\":[{\"code\":\"custom\",\"path\":[],"
        + "\"message\":\"No hay cambios que guardar.\"}]}", body(patch));
    // Fuera de paridad estricta: Node responde antes con el error de body-parser (strict). Java hoy:
    // `null` se enlaza como cuerpo ausente; JSON roto es el 400 común; un valor no objeto pasa por Zod.
    assertTrue(body(fails(json(HttpRequest.POST("/api/categories", "null")), account.cookie()))
        .startsWith("{\"error\":\"Invalid input: expected string, received undefined\""));
    assertEquals("{\"error\":\"Invalid JSON\"}", body(fails(json(HttpRequest.POST("/api/categories", "{x")), account.cookie())));
    assertTrue(body(fails(json(HttpRequest.POST("/api/categories", "\"x\"")), account.cookie()))
        .startsWith("{\"error\":\"Invalid input: expected object, received string\""));
  }

  @Test
  void duplicatesAndForeignIds() throws Exception {
    var owner = register();
    var other = register();
    var id = createdId(send(json(HttpRequest.POST("/api/categories", "{\"text\":\"Pikachú\"}")), owner.cookie()));
    var duplicate = fails(json(HttpRequest.POST("/api/categories", "{\"text\":\"pikachu\"}")), owner.cookie());
    assertEquals(HttpStatus.CONFLICT, duplicate.getStatus());
    assertEquals("{\"error\":\"Ya tienes una categoría igual o equivalente.\"}", body(duplicate));

    var foreign = fails(json(HttpRequest.PATCH("/api/categories/" + id, "{\"enabled\":false}")), other.cookie());
    assertEquals(HttpStatus.NOT_FOUND, foreign.getStatus());
    assertEquals("{\"error\":\"Categoría no encontrada.\"}", body(foreign));
    assertEquals(HttpStatus.NOT_FOUND, fails(HttpRequest.DELETE("/api/categories/" + id), other.cookie()).getStatus());
    assertEquals("{\"categories\":[]}", send(HttpRequest.GET("/api/categories"), other.cookie()).body());
  }

  @Test
  void databaseUniqueIndexBacksUpTheCache() throws Exception {
    var account = register();
    // Fila que la caché no conoce (escrita por otro proceso): responde la unicidad de la BD con el mismo 409.
    repository.save(CustomCategoryEntity.create(UUID.randomUUID().toString(), account.id(), "Charmander", "charmander",
        Instant.now()));
    var e = fails(json(HttpRequest.POST("/api/categories", "{\"text\":\"CHARMANDER\"}")), account.cookie());
    assertEquals(HttpStatus.CONFLICT, e.getStatus());
    assertEquals("{\"error\":\"Ya tienes una categoría igual o equivalente.\"}", body(e));
    assertEquals("{\"categories\":[]}", send(HttpRequest.GET("/api/categories"), account.cookie()).body());
    // La carga de arranque lee las filas de todos los usuarios desde la BD.
    categories.load();
    assertTrue(send(HttpRequest.GET("/api/categories"), account.cookie()).body().contains("\"text\":\"Charmander\""));
  }

  @Test
  void readsRowsWrittenByPrismaWithUtcTimestampsAndBacksUpUpdates() throws Exception {
    var account = register();
    // Fila como la escribe Prisma (hora UTC en un timestamp(3) sin zona), fuera de la caché.
    var rowId = "prisma-" + UUID.randomUUID();
    try (var connection = resolver.resolve(dataSource).getConnection();
        var insert = connection.prepareStatement("insert into \"CustomCategory\" (id, \"userId\", text, "
            + "\"normalizedText\", enabled, \"createdAt\", \"updatedAt\") values (?, ?, 'Bulbasaur', 'bulbasaur', true, "
            + "'2026-01-01 12:00:00.000', '2026-01-01 12:00:00.000')")) {
      insert.setString(1, rowId);
      insert.setString(2, account.id());
      insert.executeUpdate();
    }
    var own = createdId(send(json(HttpRequest.POST("/api/categories", "{\"text\":\"Squirtle\"}")), account.cookie()));
    // La caché no conoce "bulbasaur": el 409 lo da el índice único al actualizar.
    var e = fails(json(HttpRequest.PATCH("/api/categories/" + own, "{\"text\":\"BULBASAUR\"}")), account.cookie());
    assertEquals(HttpStatus.CONFLICT, e.getStatus());
    assertEquals("{\"error\":\"Ya tienes una categoría igual o equivalente.\"}", body(e));
    assertTrue(send(HttpRequest.GET("/api/categories"), account.cookie()).body().contains("\"text\":\"Squirtle\""));

    categories.load();
    var listed = send(HttpRequest.GET("/api/categories"), account.cookie()).body();
    assertTrue(listed.startsWith("{\"categories\":[{\"id\":\"" + rowId + "\",\"text\":\"Bulbasaur\",\"enabled\":true,"
        + "\"createdAt\":\"2026-01-01T12:00:00.000Z\",\"updatedAt\":\"2026-01-01T12:00:00.000Z\"}"), listed);
  }

  @Test
  void mutationsRebroadcastTheHostRoom() throws Exception {
    var host = register();
    var identity = new AuthUser(host.id(), "Host", AuthUser.Kind.USER, null, null, new AvatarRef.Default());
    coordinator.create(identity, "conn-host", null);
    try {
      events.sent.clear();
      var id = createdId(send(json(HttpRequest.POST("/api/categories", "{\"text\":\"Pokémon para cocinar\"}")),
          host.cookie()));
      assertEquals(1, lastHostCount(host.id()));
      send(json(HttpRequest.PATCH("/api/categories/" + id, "{\"enabled\":false}")), host.cookie());
      assertEquals(0, lastHostCount(host.id()));
      assertEquals(2, events.sent.stream().filter(s -> s.event().equals("room:state")).count());
    } finally {
      coordinator.leave(host.id());
    }
  }

  private int lastHostCount(String memberId) {
    var states = events.sent.stream()
        .filter(s -> s.event().equals("room:state") && s.memberId().equals(memberId))
        .toList();
    return ((RoomView) states.getLast().payload()).hostCustomCategoryCount();
  }
}

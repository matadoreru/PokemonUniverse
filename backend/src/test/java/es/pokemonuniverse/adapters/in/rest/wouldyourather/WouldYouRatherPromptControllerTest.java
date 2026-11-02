package es.pokemonuniverse.adapters.in.rest.wouldyourather;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.in.ws.WsRoomEvents;
import es.pokemonuniverse.adapters.out.persistence.CustomWouldYouRatherPromptEntity;
import es.pokemonuniverse.adapters.out.persistence.CustomWouldYouRatherPromptRepository;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.rooms.RoomEvents;
import es.pokemonuniverse.application.rooms.RoomView;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptService;
import es.pokemonuniverse.domain.content.WouldYouRatherPromptKey;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

/** Rutas de {@code apps/server/src/would-you-rather-prompts/routes.ts}: códigos, cuerpos exactos y el aviso a las salas. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "WouldYouRatherPromptControllerTest")
class WouldYouRatherPromptControllerTest {

  private static final String ISO = "\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z";
  private static final String BASE = "/api/would-you-rather-prompts";

  /** Recoge los {@code room:state} que el coordinador real emitiría por WebSocket. */
  @Singleton
  @Requires(property = "spec.name", value = "WouldYouRatherPromptControllerTest")
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
  @Inject CustomWouldYouRatherPromptRepository repository;
  @Inject RoomCoordinator coordinator;
  @Inject RecordingEvents events;
  @Inject WouldYouRatherPromptService prompts;

  private record Account(String id, String cookie) {}

  /** Usuario real: la FK de userId exige que exista en "User". */
  @SuppressWarnings("unchecked")
  private Account register() throws Exception {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", "wy_" + u, "email", "wy" + u + "@mail.com", "password", "0123456789")), String.class);
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
    return (String) ((Map<String, Object>) mapper.readValue(res.body(), Map.class).get("prompt")).get("id");
  }

  private String create(Account account, String optionA, String optionB) throws Exception {
    return createdId(send(json(HttpRequest.POST(BASE,
        "{\"optionA\":\"" + optionA + "\",\"optionB\":\"" + optionB + "\"}")), account.cookie()));
  }

  private static String importBody(int count) {
    return "{\"version\":1,\"prompts\":[" + IntStream.range(0, count)
        .mapToObj(i -> "{\"optionA\":\"Opción A " + i + "\",\"optionB\":\"Opción B " + i + "\"}")
        .collect(Collectors.joining(",")) + "]}";
  }

  @Test
  void anonymousAndGuestsAre401OnEveryRoute() {
    for (var cookie : new String[] {null, guestCookie()}) {
      for (var request : List.<MutableHttpRequest<?>>of(
          HttpRequest.GET(BASE),
          json(HttpRequest.POST(BASE, "{\"foo\":1}")),
          json(HttpRequest.POST(BASE + "/import", "{\"foo\":1}")),
          json(HttpRequest.PATCH(BASE + "/x", "{}")),
          HttpRequest.DELETE(BASE + "/x"))) {
        var e = fails(request, cookie);
        assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus());
        assertEquals("{\"error\":\"Registered account required\"}", body(e));
      }
    }
  }

  @Test
  void createsListsImportsUpdatesAndDeletes() throws Exception {
    var account = register();
    var created = send(json(HttpRequest.POST(BASE, "{\"optionA\":\" Vivir con Gengar \",\"optionB\":\"Viajar con Magikarp\"}")),
        account.cookie());
    assertEquals(HttpStatus.CREATED, created.getStatus());
    var id = createdId(created);
    var view = "\\{\"id\":\"" + id + "\",\"optionA\":\"Vivir con Gengar\",\"optionB\":\"Viajar con Magikarp\","
        + "\"enabled\":true,\"createdAt\":\"" + ISO + "\",\"updatedAt\":\"" + ISO + "\"}";
    assertTrue(created.body().matches("\\{\"prompt\":" + view + "}"), created.body());
    var listed = send(HttpRequest.GET(BASE), account.cookie());
    assertTrue(listed.body().matches("\\{\"prompts\":\\[" + view + "]}"), listed.body());

    var imported = send(json(HttpRequest.POST(BASE + "/import", importBody(2))), account.cookie());
    assertEquals(HttpStatus.CREATED, imported.getStatus());
    assertTrue(imported.body().matches("\\{\"prompts\":\\[\\{\"id\":\"[^\"]+\",\"optionA\":\"Opción A 0\",\"optionB\":\"Opción B 0\","
        + "\"enabled\":true,\"createdAt\":\"" + ISO + "\",\"updatedAt\":\"" + ISO + "\"},\\{\"id\":\"[^\"]+\",\"optionA\":\"Opción A 1\".*]}"),
        imported.body());

    var updated = send(json(HttpRequest.PATCH(BASE + "/" + id, "{\"optionB\":\"Cenar con Snorlax\",\"enabled\":false}")),
        account.cookie());
    assertEquals(HttpStatus.OK, updated.getStatus());
    assertTrue(updated.body().startsWith("{\"prompt\":{\"id\":\"" + id + "\",\"optionA\":\"Vivir con Gengar\","
        + "\"optionB\":\"Cenar con Snorlax\",\"enabled\":false,"), updated.body());
    var stored = repository.findById(id).orElseThrow();
    assertEquals(false, stored.isEnabled());
    assertEquals(WouldYouRatherPromptKey.of("Vivir con Gengar", "Cenar con Snorlax"), stored.getNormalizedKey());

    assertEquals(HttpStatus.NO_CONTENT, send(HttpRequest.DELETE(BASE + "/" + id), account.cookie()).getStatus());
    assertTrue(repository.findById(id).isEmpty());
    var again = fails(HttpRequest.DELETE(BASE + "/" + id), account.cookie());
    assertEquals(HttpStatus.NOT_FOUND, again.getStatus());
    assertEquals("{\"error\":\"Pareja no encontrada.\"}", body(again));
  }

  @Test
  void validationErrorsCarryZodIssuesAndServiceErrorsDoNot() throws Exception {
    var account = register();
    var refine = fails(json(HttpRequest.POST(BASE, "{\"optionA\":\"Pikachu\",\"optionB\":\"pikachú\"}")), account.cookie());
    assertEquals(HttpStatus.BAD_REQUEST, refine.getStatus());
    assertEquals("{\"error\":\"Las dos opciones deben ser diferentes.\",\"issues\":[{\"code\":\"custom\",\"path\":[\"optionB\"],"
        + "\"message\":\"Las dos opciones deben ser diferentes.\"}]}", body(refine));
    var normalized = fails(json(HttpRequest.POST(BASE, "{\"optionA\":\"Pikachu!\",\"optionB\":\"pikachu\"}")), account.cookie());
    assertEquals(HttpStatus.BAD_REQUEST, normalized.getStatus());
    assertEquals("{\"error\":\"Las dos opciones deben ser diferentes.\"}", body(normalized));

    var empty = fails(json(HttpRequest.POST(BASE + "/import", importBody(0))), account.cookie());
    assertEquals("{\"error\":\"Incluye al menos un dilema.\",\"issues\":[{\"origin\":\"array\",\"code\":\"too_small\","
        + "\"minimum\":1,\"inclusive\":true,\"path\":[\"prompts\"],\"message\":\"Incluye al menos un dilema.\"}]}", body(empty));
    var tooMany = fails(json(HttpRequest.POST(BASE + "/import", importBody(101))), account.cookie());
    assertEquals("{\"error\":\"Puedes importar hasta 100 dilemas cada vez.\",\"issues\":[{\"origin\":\"array\",\"code\":\"too_big\","
        + "\"maximum\":100,\"inclusive\":true,\"path\":[\"prompts\"],\"message\":\"Puedes importar hasta 100 dilemas cada vez.\"}]}",
        body(tooMany));
    var nested = fails(json(HttpRequest.POST(BASE + "/import",
        "{\"version\":1,\"prompts\":[{\"optionA\":\"Opción A\",\"optionB\":\"Opción B\"},{\"optionA\":\"Pikachu\",\"optionB\":\"pikachú\"}]}")),
        account.cookie());
    assertEquals("{\"error\":\"Las dos opciones deben ser diferentes.\",\"issues\":[{\"code\":\"custom\",\"path\":[\"prompts\",1,\"optionB\"],"
        + "\"message\":\"Las dos opciones deben ser diferentes.\"}]}", body(nested));
    var internal = fails(json(HttpRequest.POST(BASE + "/import",
        "{\"version\":1,\"prompts\":[{\"optionA\":\"Elegir a Eevee\",\"optionB\":\"Elegir a Mew\"},{\"optionA\":\"elegir a mew\",\"optionB\":\"ELEGIR A EEVEE\"}]}")),
        account.cookie());
    assertEquals(HttpStatus.CONFLICT, internal.getStatus());
    assertEquals("{\"error\":\"El JSON contiene dilemas duplicados o invertidos.\"}", body(internal));
    assertEquals("{\"prompts\":[]}", send(HttpRequest.GET(BASE), account.cookie()).body());

    var id = create(account, "Primera opción", "Segunda opción");
    var noChanges = fails(json(HttpRequest.PATCH(BASE + "/" + id, "{}")), account.cookie());
    assertEquals("{\"error\":\"No hay cambios que guardar.\",\"issues\":[{\"code\":\"custom\",\"path\":[],"
        + "\"message\":\"No hay cambios que guardar.\"}]}", body(noChanges));
    var same = fails(json(HttpRequest.PATCH(BASE + "/" + id, "{\"optionB\":\"primera opcion\"}")), account.cookie());
    assertEquals("{\"error\":\"Las dos opciones deben ser diferentes.\"}", body(same));
    var longId = fails(json(HttpRequest.PATCH(BASE + "/" + "x".repeat(129), "{}")), account.cookie());
    assertTrue(body(longId).startsWith("{\"error\":\"Too big: expected string to have <=128 characters\",\"issues\":["), body(longId));
  }

  @Test
  void missingBodyIsAnEmptyObjectLikeExpress() throws Exception {
    var account = register();
    assertEquals("{\"error\":\"Invalid input: expected string, received undefined\",\"issues\":[{\"expected\":\"string\","
        + "\"code\":\"invalid_type\",\"path\":[\"optionA\"],\"message\":\"Invalid input: expected string, received undefined\"},"
        + "{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"optionB\"],\"message\":\"Invalid input: expected string, received undefined\"}]}",
        body(fails(HttpRequest.POST(BASE, ""), account.cookie())));
    assertEquals("{\"error\":\"Invalid input: expected 1\",\"issues\":[{\"code\":\"invalid_value\",\"values\":[1],\"path\":[\"version\"],"
        + "\"message\":\"Invalid input: expected 1\"},{\"expected\":\"array\",\"code\":\"invalid_type\",\"path\":[\"prompts\"],"
        + "\"message\":\"Invalid input: expected array, received undefined\"}]}",
        body(fails(HttpRequest.POST(BASE + "/import", ""), account.cookie())));
    var id = create(account, "Primera opción", "Segunda opción");
    assertEquals("{\"error\":\"No hay cambios que guardar.\",\"issues\":[{\"code\":\"custom\",\"path\":[],"
        + "\"message\":\"No hay cambios que guardar.\"}]}", body(fails(HttpRequest.PATCH(BASE + "/" + id, ""), account.cookie())));
  }

  @Test
  void duplicatesAndForeignIds() throws Exception {
    var owner = register();
    var other = register();
    var id = create(owner, "Vivir con Gengar", "Viajar con Magikarp");
    var reversed = fails(json(HttpRequest.POST(BASE, "{\"optionA\":\"viajar con magikarp!\",\"optionB\":\"VIVIR CON GENGAR\"}")),
        owner.cookie());
    assertEquals(HttpStatus.CONFLICT, reversed.getStatus());
    assertEquals("{\"error\":\"Ya tienes una pareja igual o equivalente.\"}", body(reversed));
    var imported = fails(json(HttpRequest.POST(BASE + "/import",
        "{\"version\":1,\"prompts\":[{\"optionA\":\"Elegir a Eevee\",\"optionB\":\"Elegir a Mew\"},{\"optionA\":\"Viajar con Magikarp\",\"optionB\":\"Vivir con Gengar\"}]}")),
        owner.cookie());
    assertEquals("{\"error\":\"Ya tienes una pareja igual o equivalente.\"}", body(imported));
    assertEquals(1, prompts.list(owner.id()).size());

    var foreign = fails(json(HttpRequest.PATCH(BASE + "/" + id, "{\"enabled\":false}")), other.cookie());
    assertEquals(HttpStatus.NOT_FOUND, foreign.getStatus());
    assertEquals("{\"error\":\"Pareja no encontrada.\"}", body(foreign));
    assertEquals(HttpStatus.NOT_FOUND, fails(HttpRequest.DELETE(BASE + "/" + id), other.cookie()).getStatus());
    assertEquals("{\"prompts\":[]}", send(HttpRequest.GET(BASE), other.cookie()).body());
  }

  @Test
  void databaseUniqueIndexBacksUpTheCacheAndImportIsAllOrNothing() throws Exception {
    var account = register();
    // Fila que la caché no conoce (escrita por otro proceso): responde la unicidad de la BD con el mismo 409.
    repository.save(CustomWouldYouRatherPromptEntity.create(UUID.randomUUID().toString(), account.id(), "Opción A 1",
        "Opción B 1", WouldYouRatherPromptKey.of("Opción A 1", "Opción B 1"), Instant.now()));
    var e = fails(json(HttpRequest.POST(BASE + "/import", importBody(3))), account.cookie());
    assertEquals(HttpStatus.CONFLICT, e.getStatus());
    assertEquals("{\"error\":\"Ya tienes una pareja igual o equivalente.\"}", body(e));
    assertEquals(1, countFor(account.id()));
    assertEquals("{\"prompts\":[]}", send(HttpRequest.GET(BASE), account.cookie()).body());
    prompts.load();
    assertTrue(send(HttpRequest.GET(BASE), account.cookie()).body().contains("\"optionA\":\"Opción A 1\""));
  }

  private long countFor(String userId) {
    var count = 0L;
    for (var row : repository.findAll()) if (row.getUserId().equals(userId)) count++;
    return count;
  }

  @Test
  void concurrentPatchesConvergingOnOnePairGiveOne200AndOne409() throws Exception {
    var account = register();
    var first = create(account, "Primera opción", "Segunda opción");
    var second = create(account, "Tercera opción", "Cuarta opción");
    var start = new CountDownLatch(1);
    var results = new ArrayList<Object>();
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var futures = List.of(
          executor.submit(() -> {
            start.await();
            return patch(first, "{\"optionA\":\"Vivir con Gengar\",\"optionB\":\"Viajar con Magikarp\"}", account);
          }),
          executor.submit(() -> {
            start.await();
            return patch(second, "{\"optionA\":\"viajar con magikarp\",\"optionB\":\"VIVIR con Gengar\"}", account);
          }));
      start.countDown();
      for (var future : futures) results.add(future.get(30, TimeUnit.SECONDS));
    }
    assertEquals(1, results.stream().filter(r -> r.equals(200)).count(), results.toString());
    assertEquals(1, results.stream().filter(r -> r.equals("409 {\"error\":\"Ya tienes una pareja igual o equivalente.\"}")).count(),
        results.toString());
    assertEquals(1, repository.countByUserIdAndNormalizedKey(account.id(), "viajar con magikarp::vivir con gengar"));
  }

  private Object patch(String id, String json, Account account) {
    try {
      return send(json(HttpRequest.PATCH(BASE + "/" + id, json)), account.cookie()).getStatus().getCode();
    } catch (HttpClientResponseException e) {
      return e.getStatus().getCode() + " " + body(e);
    }
  }

  @Test
  void mutationsRebroadcastTheHostRoom() throws Exception {
    var host = register();
    var identity = new AuthUser(host.id(), "Host", AuthUser.Kind.USER, null, null, new AvatarRef.Default());
    coordinator.create(identity, "conn-host", null);
    try {
      events.sent.clear();
      var id = create(host, "Vivir con Gengar", "Viajar con Magikarp");
      assertEquals(1, lastHostCount(host.id()));
      send(json(HttpRequest.POST(BASE + "/import", importBody(2))), host.cookie());
      assertEquals(3, lastHostCount(host.id()));
      send(json(HttpRequest.PATCH(BASE + "/" + id, "{\"enabled\":false}")), host.cookie());
      assertEquals(2, lastHostCount(host.id()));
      send(HttpRequest.DELETE(BASE + "/" + id), host.cookie());
      assertEquals(2, lastHostCount(host.id()));
      assertEquals(4, events.sent.stream().filter(s -> s.event().equals("room:state")).count());
    } finally {
      coordinator.leave(host.id());
    }
  }

  private int lastHostCount(String memberId) {
    var states = events.sent.stream()
        .filter(s -> s.event().equals("room:state") && s.memberId().equals(memberId))
        .toList();
    return ((RoomView) states.getLast().payload()).hostWouldYouRatherPromptCount();
  }
}

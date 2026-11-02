package es.pokemonuniverse.adapters.in.rest.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.in.ws.WsRoomEvents;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.avatar.TestImages;
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
import io.micronaut.json.JsonMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.test.support.TestPropertyProvider;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.awt.Color;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Rutas de escritura de avatar de {@code apps/server/src/auth/routes.ts}: códigos, cuerpos exactos, cookie re-firmada,
 * borrado del fichero anterior, el límite de 12 por 15 min que ignora {@code rate-limit-disabled} (activo en test) y el
 * aviso a las salas.
 */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "AvatarWriteRoutesTest")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AvatarWriteRoutesTest implements TestPropertyProvider {

  private static final String INVALID = "El archivo no es una imagen JPEG, PNG o WEBP válida.";
  private static final AtomicInteger IPS = new AtomicInteger();

  /** Recoge los {@code room:state} que el coordinador real emitiría por WebSocket. */
  @Singleton
  @Requires(property = "spec.name", value = "AvatarWriteRoutesTest")
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

  private Path dir;

  @Inject @Client("/") HttpClient client;
  @Inject IdentityTokens tokens;
  @Inject JsonMapper json;
  @Inject UserRepository users;
  @Inject RoomCoordinator coordinator;
  @Inject RecordingEvents events;

  @Override
  public Map<String, String> getProperties() {
    try {
      dir = Files.createTempDirectory("pu-avatar-writes");
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
    return Map.of("pu.avatar-storage-dir", dir.toString());
  }

  private record Account(String id, String cookie) {}

  /** IP propia por prueba: el límite de avatares cuenta aunque el resto de límites esté desactivado en test. */
  private static String ip() {
    return "198.51.100." + IPS.incrementAndGet();
  }

  private Account register() throws IOException {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", "av_" + u, "email", "av" + u + "@mail.com", "password", "0123456789")), String.class);
    return new Account((String) user(res.body()).get("id"), sessionCookie(res));
  }

  private String guestCookie(AvatarRef avatar) {
    var guest = new AuthUser("guest_" + UUID.randomUUID(), "Ash", AuthUser.Kind.GUEST, null, null, avatar);
    return "pu_session=" + tokens.sign(guest, Instant.now());
  }

  private static String sessionCookie(HttpResponse<?> res) {
    return res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> user(String body) throws IOException {
    return (Map<String, Object>) json.readValue(body, Map.class).get("user");
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> avatarOf(Map<String, Object> user) {
    return (Map<String, Object>) user.get("avatar");
  }

  private HttpResponse<String> call(MutableHttpRequest<?> request, @Nullable String cookie, String ip) {
    if (cookie != null) request.header("Cookie", cookie);
    request.header("X-Forwarded-For", ip);
    try {
      return client.toBlocking().exchange(request, String.class);
    } catch (HttpClientResponseException e) {
      @SuppressWarnings("unchecked")
      var response = (HttpResponse<String>) e.getResponse();
      return response;
    }
  }

  private static String body(HttpResponse<String> res) {
    return res.getBody(String.class).orElse("");
  }

  private static MutableHttpRequest<byte[]> image(MutableHttpRequest<byte[]> request, String type) {
    return request.contentType(type);
  }

  private static MutableHttpRequest<byte[]> guestUpload(String query, byte[] bytes, String type) {
    return image(HttpRequest.POST("/api/auth/guest/custom-avatar" + query, bytes), type);
  }

  private static MutableHttpRequest<byte[]> customUpload(byte[] bytes, String type) {
    return image(HttpRequest.PUT("/api/auth/profile/avatar/custom", bytes), type);
  }

  private static MutableHttpRequest<String> preset(String jsonBody) {
    return HttpRequest.PUT("/api/auth/profile/avatar/preset", jsonBody).contentType(MediaType.APPLICATION_JSON_TYPE);
  }

  private static byte[] png() {
    return TestImages.png(64, 64, Color.BLUE);
  }

  private int version(String userId) {
    return users.findById(userId).orElseThrow().getAvatarVersion();
  }

  @Test
  void guestCustomAvatarIs201WithCookieAndRemovesThePreviousGuestFile() throws IOException {
    var ip = ip();
    var first = call(guestUpload("?displayName=%20Ana%20", png(), "image/png"), null, ip);
    assertEquals(HttpStatus.CREATED, first.status(), body(first));
    var user = user(first.body());
    assertEquals(List.of("id", "displayName", "kind", "avatar"), List.copyOf(user.keySet()));
    assertTrue(((String) user.get("id")).matches("^guest_[0-9a-f-]{36}$"));
    assertEquals("Ana", user.get("displayName"));
    assertEquals("GUEST", user.get("kind"));
    var avatar = avatarOf(user);
    assertEquals(List.of("type", "value", "version"), List.copyOf(avatar.keySet()));
    assertEquals("CUSTOM", avatar.get("type"));
    var file = (String) avatar.get("value");
    assertTrue(Files.exists(dir.resolve(file)));
    var cookie = sessionCookie(first);
    var me = call(HttpRequest.GET("/api/auth/me"), cookie, ip);
    assertEquals(user, user(me.body()));

    var second = call(guestUpload("?displayName=Ana", png(), "image/png"), cookie, ip);
    assertEquals(HttpStatus.CREATED, second.status());
    var next = (String) avatarOf(user(second.body())).get("value");
    assertNotEquals(file, next);
    assertTrue(Files.exists(dir.resolve(next)));
    assertFalse(Files.exists(dir.resolve(file)), "el avatar anterior del invitado se borra");
  }

  @Test
  void guestDisplayNameIsValidatedWithZodIssues() {
    var ip = ip();
    var missing = call(guestUpload("", png(), "image/png"), null, ip);
    assertEquals(HttpStatus.BAD_REQUEST, missing.status());
    assertEquals("{\"error\":\"Invalid input: expected string, received undefined\",\"issues\":[{\"expected\":\"string\","
        + "\"code\":\"invalid_type\",\"path\":[\"displayName\"],\"message\":\"Invalid input: expected string, received "
        + "undefined\"}]}", body(missing));
    var regex = "/^[\\\\p{L}\\\\p{N}_ -]+$/u";
    var empty = call(guestUpload("?displayName=", png(), "image/png"), null, ip);
    assertEquals("{\"error\":\"Too small: expected string to have >=2 characters\",\"issues\":[{\"origin\":\"string\","
        + "\"code\":\"too_small\",\"minimum\":2,\"inclusive\":true,\"path\":[\"displayName\"],\"message\":\"Too small: "
        + "expected string to have >=2 characters\"},{\"origin\":\"string\",\"code\":\"invalid_format\",\"format\":"
        + "\"regex\",\"pattern\":\"" + regex + "\",\"path\":[\"displayName\"],\"message\":\"Invalid string: must match "
        + "pattern " + regex + "\"}]}", body(empty));
    var tooLong = call(guestUpload("?displayName=" + "a".repeat(25), png(), "image/png"), null, ip);
    assertEquals("Too big: expected string to have <=24 characters", error(tooLong));
    var repeated = call(guestUpload("?displayName=Ana&displayName=Eva", png(), "image/png"), null, ip);
    assertEquals("Invalid input: expected string, received array", error(repeated));
    // El nombre se valida antes que el tipo de contenido.
    var plain = call(guestUpload("", "hola".getBytes(), "text/plain"), null, ip);
    assertEquals(HttpStatus.BAD_REQUEST, plain.status());
    assertEquals("Invalid input: expected string, received undefined", error(plain));
  }

  @SuppressWarnings("unchecked")
  private String error(HttpResponse<String> res) {
    try {
      return (String) json.readValue(body(res), Map.class).get("error");
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  @Test
  void otherContentTypesAre415() {
    var ip = ip();
    for (var type : List.of("text/plain", "application/json", "image/gif", "application/octet-stream")) {
      var res = call(guestUpload("?displayName=Ana", "{}".getBytes(), type), null, ip);
      assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, res.status(), type);
      assertEquals("{\"error\":\"Usa una imagen JPEG, PNG o WEBP.\"}", body(res), type);
    }
  }

  @Test
  void contentTypeParametersPassTheParserButFailTheExactMatch() {
    var ip = ip();
    // express.raw acepta «image/png; charset=x» e «IMAGE/PNG», pero processAndStore exige el tipo exacto.
    for (var type : List.of("image/png; charset=x", "IMAGE/PNG")) {
      var res = call(guestUpload("?displayName=Ana", png(), type), null, ip);
      assertEquals(HttpStatus.BAD_REQUEST, res.status(), type);
      assertEquals("{\"error\":\"" + INVALID + "\"}", body(res), type);
    }
    var mismatch = call(guestUpload("?displayName=Ana", png(), "image/jpeg"), null, ip);
    assertEquals("{\"error\":\"" + INVALID + "\"}", body(mismatch));
  }

  @Test
  void bodiesOverFiveMebibytesAre413LikeExpressRaw() {
    var ip = ip();
    byte[] oversize = Arrays.copyOf(png(), 5 * 1024 * 1024 + 1);
    // express.raw corta antes de validar el nombre: el 413 de body-parser llega con su propio mensaje.
    var res = call(guestUpload("", oversize, "image/png"), null, ip);
    assertEquals(HttpStatus.REQUEST_ENTITY_TOO_LARGE, res.status());
    assertEquals("{\"error\":\"request entity too large\"}", body(res));
    // Por encima del max-request-size de Micronaut (10 MB) también: mismo cuerpo que el 413 de body-parser.
    var huge = call(guestUpload("?displayName=Ana", new byte[11 * 1024 * 1024], "image/png"), null, ip);
    assertEquals(HttpStatus.REQUEST_ENTITY_TOO_LARGE, huge.status());
    assertEquals("{\"error\":\"request entity too large\"}", body(huge));
    // Exactamente 5 MiB pasa el límite: un PNG con relleno tras IEND es válido (sharp también lo acepta).
    var exact = call(guestUpload("?displayName=Ana", Arrays.copyOf(png(), 5 * 1024 * 1024), "image/png"), null, ip);
    assertEquals(HttpStatus.CREATED, exact.status(), body(exact));
    // Un cuerpo vacío es un Buffer de 0 bytes en Express: el literal de 5 MB con 400.
    var empty = call(guestUpload("?displayName=Ana", new byte[0], "image/png"), null, ip);
    assertEquals(HttpStatus.BAD_REQUEST, empty.status());
    assertEquals("{\"error\":\"La imagen supera el límite de 5 MB.\"}", body(empty));
  }

  @Test
  void invalidImagesAre400AndLeaveNoFile() throws IOException {
    var ip = ip();
    var account = register();
    try (var before = Files.list(dir)) {
      long count = before.count();
      var small = call(customUpload(TestImages.png(63, 63, Color.RED), "image/png"), account.cookie(), ip);
      assertEquals(HttpStatus.BAD_REQUEST, small.status());
      assertEquals("{\"error\":\"La imagen debe medir entre 64 y 4096 píxeles por lado.\"}", body(small));
      try (var after = Files.list(dir)) {
        assertEquals(count, after.count());
      }
    }
    assertEquals(0, version(account.id()));
  }

  @Test
  void profileRoutesRequireARegisteredAccountBeforeAnythingElse() {
    var ip = ip();
    var guest = guestCookie(new AvatarRef.Default());
    for (var cookie : Arrays.asList(null, guest)) {
      var requests = List.<MutableHttpRequest<?>>of(
          preset("{\"presetId\":\"trainer-aqua\"}"),
          HttpRequest.DELETE("/api/auth/profile/avatar"),
          customUpload(png(), "image/png"),
          customUpload("x".getBytes(), "text/plain"),
          customUpload(Arrays.copyOf(png(), 5 * 1024 * 1024 + 1), "image/png"));
      for (var request : requests) {
        var res = call(request, cookie, ip);
        assertEquals(HttpStatus.UNAUTHORIZED, res.status(), request.getPath());
        assertEquals("{\"error\":\"Registered account required\"}", body(res));
      }
    }
  }

  @Test
  void presetDeleteAndCustomUpdateTheUserAndResignTheCookie() throws IOException {
    var ip = ip();
    var account = register();

    var preset = call(preset("{\"presetId\":\"trainer-aqua\"}"), account.cookie(), ip);
    assertEquals(HttpStatus.OK, preset.status(), body(preset));
    var user = user(preset.body());
    assertEquals(account.id(), user.get("id"));
    assertEquals(Map.of("type", "PRESET", "value", "trainer-aqua"), avatarOf(user));
    assertEquals(1, version(account.id()));
    var cookie = sessionCookie(preset);
    assertEquals(avatarOf(user), avatarOf(user(call(HttpRequest.GET("/api/auth/me"), cookie, ip).body())));

    var custom = call(customUpload(png(), "image/png"), cookie, ip);
    assertEquals(HttpStatus.OK, custom.status(), body(custom));
    var first = avatarOf(user(custom.body()));
    assertEquals("CUSTOM", first.get("type"));
    assertEquals(2, ((Number) first.get("version")).intValue(), "la versión es avatarVersion de la BD");
    assertEquals(2, version(account.id()));
    var firstFile = dir.resolve((String) first.get("value"));
    assertTrue(Files.exists(firstFile));
    cookie = sessionCookie(custom);

    var replaced = call(customUpload(png(), "image/png"), cookie, ip);
    var second = avatarOf(user(replaced.body()));
    assertEquals(3, ((Number) second.get("version")).intValue());
    assertTrue(Files.exists(dir.resolve((String) second.get("value"))));
    assertFalse(Files.exists(firstFile), "el avatar personalizado anterior se borra");
    cookie = sessionCookie(replaced);

    var removed = call(HttpRequest.DELETE("/api/auth/profile/avatar"), cookie, ip);
    assertEquals(HttpStatus.OK, removed.status());
    assertEquals(Map.of("type", "DEFAULT"), avatarOf(user(removed.body())));
    assertEquals(4, version(account.id()));
    assertFalse(Files.exists(dir.resolve((String) second.get("value"))));
    var entity = users.findById(account.id()).orElseThrow();
    assertEquals("DEFAULT", entity.getAvatarType());
    assertEquals(null, entity.getAvatarValue());
    assertEquals(Map.of("type", "DEFAULT"), avatarOf(user(call(HttpRequest.GET("/api/auth/me"), sessionCookie(removed), ip).body())));
  }

  @Test
  void presetBodyIsAStrictZodObject() throws IOException {
    var ip = ip();
    var account = register();
    var values = "\"trainer-berry\",\"trainer-aqua\",\"trainer-electric\",\"trainer-violet\"";
    var message = "Invalid option: expected one of \\\"trainer-berry\\\"|\\\"trainer-aqua\\\"|\\\"trainer-electric\\\"|"
        + "\\\"trainer-violet\\\"";
    var invalid = call(preset("{\"presetId\":\"x\"}"), account.cookie(), ip);
    assertEquals(HttpStatus.BAD_REQUEST, invalid.status());
    assertEquals("{\"error\":\"" + message + "\",\"issues\":[{\"code\":\"invalid_value\",\"values\":[" + values
        + "],\"path\":[\"presetId\"],\"message\":\"" + message + "\"}]}", body(invalid));
    var missing = call(HttpRequest.PUT("/api/auth/profile/avatar/preset", "").contentType(MediaType.APPLICATION_JSON_TYPE),
        account.cookie(), ip);
    assertEquals(HttpStatus.BAD_REQUEST, missing.status());
    assertTrue(body(missing).contains("\"path\":[\"presetId\"]"), body(missing));
    var extra = call(preset("{\"presetId\":\"trainer-aqua\",\"x\":1}"), account.cookie(), ip);
    assertEquals("{\"error\":\"Unrecognized key: \\\"x\\\"\",\"issues\":[{\"code\":\"unrecognized_keys\",\"keys\":[\"x\"],"
        + "\"path\":[],\"message\":\"Unrecognized key: \\\"x\\\"\"}]}", body(extra));
    var array = call(preset("[]"), account.cookie(), ip);
    assertEquals("{\"error\":\"Invalid input: expected object, received array\",\"issues\":[{\"expected\":\"object\","
        + "\"code\":\"invalid_type\",\"path\":[],\"message\":\"Invalid input: expected object, received array\"}]}",
        body(array));
    assertEquals(0, version(account.id()));
  }

  @Test
  void thirteenthWriteIn15MinutesIs429EvenWithRateLimitDisabled() throws IOException {
    var ip = ip();
    var account = register();
    var guest = guestCookie(new AvatarRef.Default());
    // requireUser va antes del limitador: las peticiones rechazadas con 401 no cuentan.
    for (int i = 0; i < 13; i++) {
      assertEquals(HttpStatus.UNAUTHORIZED, call(preset("{\"presetId\":\"trainer-aqua\"}"), guest, ip).status());
    }
    // Un único contador para las cuatro rutas.
    var requests = List.<MutableHttpRequest<?>>of(
        guestUpload("?displayName=Ana", png(), "image/png"),
        customUpload(png(), "image/png"),
        HttpRequest.DELETE("/api/auth/profile/avatar"));
    for (int i = 0; i < 12; i++) {
      var request = i < requests.size() ? requests.get(i) : preset("{\"presetId\":\"trainer-aqua\"}");
      var res = call(request, i == 0 ? null : account.cookie(), ip);
      assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, res.status(), "petición " + (i + 1));
      assertEquals("12", res.header("RateLimit-Limit"));
    }
    var limited = call(HttpRequest.DELETE("/api/auth/profile/avatar"), account.cookie(), ip);
    assertEquals(HttpStatus.TOO_MANY_REQUESTS, limited.status());
    assertEquals("{\"error\":\"Too many requests\"}", body(limited));
    assertEquals("0", limited.header("RateLimit-Remaining"));
    // Otra IP sigue libre y las lecturas no cuentan.
    assertEquals(HttpStatus.OK, call(HttpRequest.DELETE("/api/auth/profile/avatar"), account.cookie(), ip()).status());
    assertEquals(HttpStatus.OK, call(HttpRequest.GET("/api/auth/me"), account.cookie(), ip).status());
  }

  @Test
  void avatarChangesRebroadcastTheRoom() throws IOException {
    var ip = ip();
    var account = register();
    var identity = new AuthUser(account.id(), "Host", AuthUser.Kind.USER, null, null, new AvatarRef.Default());
    coordinator.create(identity, "conn-avatar", null);
    try {
      events.sent.clear();
      call(preset("{\"presetId\":\"trainer-violet\"}"), account.cookie(), ip);
      assertEquals(new AvatarRef.Preset("trainer-violet"), lastAvatar(account.id()));
      var custom = avatarOf(user(call(customUpload(png(), "image/png"), account.cookie(), ip).body()));
      assertEquals(new AvatarRef.Custom((String) custom.get("value"), 2), lastAvatar(account.id()));
      assertEquals(2, events.sent.stream().filter(s -> s.event().equals("room:state")).count());
    } finally {
      coordinator.leave(account.id());
    }
  }

  private AvatarRef lastAvatar(String memberId) {
    var states = events.sent.stream()
        .filter(s -> s.event().equals("room:state") && s.memberId().equals(memberId))
        .toList();
    return ((RoomView) states.getLast().payload()).members().getFirst().avatar();
  }
}

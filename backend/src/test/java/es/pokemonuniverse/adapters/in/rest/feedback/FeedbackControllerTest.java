package es.pokemonuniverse.adapters.in.rest.feedback;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.FeedbackRepository;
import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
class FeedbackControllerTest {

  private static final String DESCRIPTION = "Esto es una descripcion suficientemente larga";

  @Inject @Client("/") HttpClient client;
  @Inject IdentityTokens tokens;
  @Inject GameRegistry registry;
  @Inject FeedbackRepository repository;
  @Inject io.micronaut.serde.ObjectMapper mapper;

  private final List<String> created = new ArrayList<>();

  @AfterEach
  void cleanup() {
    created.forEach(repository::deleteById);
  }

  /** Usuario real: la FK de authorUserId exige que exista en "User". */
  private String registeredUserCookie() {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", "fb_" + u, "email", "fb" + u + "@mail.com", "password", "0123456789")), Map.class);
    return res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow().split(";")[0];
  }

  private String cookie(AuthUser.Kind kind, String id) {
    var user = new AuthUser(id, "Ash", kind, null, null, new AvatarRef.Default());
    return "pu_session=" + tokens.sign(user, Instant.now());
  }

  private static Map<String, Object> body(Object... kv) {
    var m = new LinkedHashMap<String, Object>();
    for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
    return m;
  }

  private HttpResponse<String> post(String cookie, Map<String, Object> body) {
    var req = HttpRequest.POST("/api/feedback", body);
    if (cookie != null) req = req.header("Cookie", cookie);
    var res = client.toBlocking().exchange(req, String.class);
    return res;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> feedback(HttpResponse<String> res) throws Exception {
    var map = (Map<String, Object>) mapper.readValue(res.body(), Map.class);
    var fb = (Map<String, Object>) map.get("feedback");
    created.add((String) fb.get("id"));
    return fb;
  }

  private HttpClientResponseException fail(String cookie, Map<String, Object> body) {
    return assertThrows(HttpClientResponseException.class, () -> post(cookie, body));
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> error(HttpClientResponseException e) {
    return e.getResponse().getBody(Map.class).orElseThrow();
  }

  @Test
  void anonymousIs401() {
    var e = fail(null, body("type", "BUG", "description", DESCRIPTION));
    assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus());
    assertEquals(Map.of("error", "Authentication required"), error(e));
  }

  private HttpClientResponseException failRaw(String cookie, String rawBody) {
    var req = HttpRequest.POST("/api/feedback", rawBody).contentType("application/json");
    if (cookie != null) req = req.header("Cookie", cookie);
    var finalReq = req;
    return assertThrows(HttpClientResponseException.class, () -> client.toBlocking().exchange(finalReq, String.class));
  }

  /** Como Node: la autenticación se comprueba antes de leer el cuerpo, así que un anónimo nunca ve un 400. */
  @Test
  void anonymousWithMalformedBodyIs401() {
    for (var raw : List.of("{\"type\":", "", "[]", "{\"type\":\"NOPE\"}")) {
      var e = failRaw(null, raw);
      assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus(), raw);
      assertEquals(Map.of("error", "Authentication required"), error(e), raw);
    }
  }

  @Test
  void guestWithMalformedBodyIs400() {
    var e = failRaw(cookie(AuthUser.Kind.GUEST, "guest-fb-raw"), "{\"type\":");
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
  }

  @Test
  @SuppressWarnings("unchecked")
  void guestCanSubmitGeneral() throws Exception {
    var res = post(cookie(AuthUser.Kind.GUEST, "g1"), body("type", "BUG", "description", "  " + DESCRIPTION + "  "));
    assertEquals(HttpStatus.CREATED, res.getStatus());
    assertTrue(res.body().contains("\"gameId\":null"), res.body());
    var fb = feedback(res);
    assertEquals("GENERAL", fb.get("reference"));
    assertEquals("NEW", fb.get("status"));
    assertEquals(DESCRIPTION, fb.get("description"));
    var author = (Map<String, Object>) fb.get("author");
    assertNull(author.get("userId"));
    assertEquals("GUEST", author.get("kind"));
    assertEquals("Ash", author.get("displayName"));
    assertTrue(((String) fb.get("createdAt")).matches("\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void userSubmitMinigameInfersReference() throws Exception {
    var game = registry.list().get(0);
    var fb = feedback(post(registeredUserCookie(),
        body("type", "SUGGESTION", "gameId", game.id(), "description", DESCRIPTION)));
    assertEquals("MINIGAME", fb.get("reference"));
    assertEquals(game.id(), fb.get("gameId"));
    assertEquals(game.name(), fb.get("gameName"));
    var author = (Map<String, Object>) fb.get("author");
    assertEquals("USER", author.get("kind"));
    assertTrue(((String) author.get("userId")).length() > 0);
  }

  @Test
  void unknownGameIs400WithLiteral() {
    var e = fail(cookie(AuthUser.Kind.GUEST, "g1"), body("type", "BUG", "gameId", "no-existe", "description", DESCRIPTION));
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    assertEquals(Map.of("error", "El minijuego seleccionado no existe."), error(e));
  }

  @Test
  @SuppressWarnings("unchecked")
  void gameIdWithoutMinigameReferenceIs400() {
    var e = fail(cookie(AuthUser.Kind.GUEST, "g1"),
        body("type", "BUG", "reference", "GENERAL", "gameId", registry.list().get(0).id(), "description", DESCRIPTION));
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    var err = error(e);
    var message = "El minijuego solo se incluye cuando el feedback hace referencia a uno.";
    assertEquals(message, err.get("error"));
    assertEquals(List.of(Map.of("path", "gameId", "message", message)), err.get("issues"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void minigameReferenceWithoutGameIdIs400() {
    var e = fail(cookie(AuthUser.Kind.GUEST, "g1"), body("type", "BUG", "reference", "MINIGAME", "description", DESCRIPTION));
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    assertEquals(List.of(Map.of("path", "gameId", "message", "Selecciona un minijuego.")), error(e).get("issues"));
  }

  @Test
  void shortDescriptionIs400WithLiteral() {
    var e = fail(cookie(AuthUser.Kind.GUEST, "g1"), body("type", "BUG", "description", " corto "));
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    assertEquals("Describe el feedback con al menos 10 caracteres.", error(e).get("error"));
  }

  @Test
  void unknownKeyIs400() {
    var e = fail(cookie(AuthUser.Kind.GUEST, "g1"), body("type", "BUG", "description", DESCRIPTION, "extra", 1));
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    assertEquals(Map.of("error", "Invalid request body"), error(e));
  }

  @Test
  void roomCodeIsUppercased() throws Exception {
    var fb = feedback(post(cookie(AuthUser.Kind.GUEST, "g1"),
        body("type", "BUG", "roomCode", "ab2c3d", "description", DESCRIPTION)));
    assertEquals("AB2C3D", fb.get("roomCode"));
  }
}

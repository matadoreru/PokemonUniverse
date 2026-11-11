package es.pokemonuniverse.adapters.in.rest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

@MicronautTest
class ErrorFormatTest {

  @Inject
  @Client("/")
  HttpClient client;

  @Inject
  IdentityTokens tokens;

  private HttpClientResponseException call(HttpRequest<?> req) {
    return assertThrows(HttpClientResponseException.class, () -> client.toBlocking().exchange(req, String.class));
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> body(HttpClientResponseException ex) {
    return (Map<String, Object>) ex.getResponse().getBody(Map.class).orElseThrow();
  }

  @Test
  void apiExceptionBody() throws Exception {
    var ex = call(HttpRequest.GET("/test-errors/conflict"));
    assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    var json = body(ex);
    assertEquals("Email or username already in use", json.get("error"));
    assertFalse(json.containsKey("issues"), json.toString());
  }

  @Test
  @SuppressWarnings("unchecked")
  void validationBody() throws Exception {
    var ex = call(HttpRequest.POST("/test-errors/validate", Map.of("username", "")));
    assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus(), ex.getResponse().getBody(String.class).orElse("-"));
    var json = body(ex);
    var issues = (List<Map<String, Object>>) json.get("issues");
    assertEquals("username", issues.get(0).get("path"));
    assertEquals(issues.get(0).get("message"), json.get("error"));
  }

  @Test
  void applicationExceptionsMapToTheirStatus() {
    var cases = Map.of(
        "conflict", HttpStatus.CONFLICT,
        "unauthorized", HttpStatus.UNAUTHORIZED,
        "not-found", HttpStatus.NOT_FOUND,
        "bad-request", HttpStatus.BAD_REQUEST);
    var messages = Map.of("conflict", "conflicto", "unauthorized", "sin sesion", "not-found", "no existe",
        "bad-request", "mal");
    cases.forEach((kind, status) -> {
      var ex = call(HttpRequest.GET("/test-errors/application/" + kind));
      assertEquals(status, ex.getStatus(), kind);
      var json = body(ex);
      assertEquals(messages.get(kind), json.get("error"), kind);
      assertFalse(json.containsKey("issues"), json.toString());
    });
  }

  @Test
  void unknownExceptionShowsMessageOutsideProd() throws Exception {
    var ex = call(HttpRequest.GET("/test-errors/boom"));
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, ex.getStatus());
    assertEquals("kaboom", body(ex).get("error"));
  }

  @Test
  void errorSubclassUsesOurShape() {
    var ex = call(HttpRequest.GET("/test-errors/error"));
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, ex.getStatus());
    var json = body(ex);
    assertEquals("fallo", json.get("error"), json.toString());
    assertFalse(json.containsKey("_links"), json.toString());
  }

  @Test
  void routingErrorsKeepTheirStatus() {
    assertEquals(HttpStatus.NOT_FOUND, call(HttpRequest.GET("/no-such-route")).getStatus());
  }

  @Test
  void checkedExceptionUsesOurShape() {
    var ex = call(HttpRequest.GET("/test-errors/checked"));
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, ex.getStatus());
    assertEquals("disk", body(ex).get("error"));
  }

  @Test
  void malformedJsonUsesOurShape() {
    var req = HttpRequest.POST("/test-errors/validate", "{\"username\":")
        .contentType("application/json");
    var ex = call(req);
    assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    assertEquals(true, body(ex).containsKey("error"), body(ex).toString());
  }

  /** Errores que genera Micronaut (rutas, método, media type, cuerpo ausente) también usan {@code {error}}. */
  private static void assertOurShape(HttpClientResponseException ex) {
    var json = body(ex);
    assertTrue(json.get("error") instanceof String s && !s.isBlank(), json.toString());
    assertFalse(json.containsKey("_links"), json.toString());
    assertFalse(json.containsKey("_embedded"), json.toString());
    assertFalse(json.containsKey("message"), json.toString());
  }

  @Test
  void notFoundUsesOurShape() {
    var ex = call(HttpRequest.GET("/nope"));
    assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    assertOurShape(ex);
  }

  @Test
  void methodNotAllowedUsesOurShape() {
    var ex = call(HttpRequest.DELETE("/api/games"));
    assertEquals(HttpStatus.METHOD_NOT_ALLOWED, ex.getStatus());
    assertOurShape(ex);
  }

  @Test
  void unsupportedMediaTypeUsesOurShape() {
    var ex = call(HttpRequest.POST("/test-errors/validate", "username=ash").contentType("text/plain"));
    assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ex.getStatus());
    assertOurShape(ex);
  }

  @Test
  void missingBodyUsesOurShape() {
    var user = new AuthUser("guest-err", "Ash", AuthUser.Kind.GUEST, null, null, new AvatarRef.Default());
    var req = HttpRequest.POST("/api/feedback", "")
        .contentType("application/json")
        .header("Cookie", "pu_session=" + tokens.sign(user, Instant.now()));
    var ex = call(req);
    assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    assertOurShape(ex);
  }
}

package es.pokemonuniverse.adapters.in.rest.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.mail.MailMessage;
import es.pokemonuniverse.support.RecordingMailSender;
import io.micronaut.context.annotation.Property;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

@MicronautTest
@Property(name = "test.mail.recording", value = "true")
class PasswordResetControllerTest {

  @Inject @Client("/") HttpClient client;
  @Inject RecordingMailSender mail;

  private static String unique() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }

  @SuppressWarnings("unchecked")
  private HttpResponse<Map<String, Object>> post(String path, Map<String, Object> body) {
    return (HttpResponse<Map<String, Object>>) (HttpResponse<?>) client.toBlocking().exchange(HttpRequest.POST(path, body), Map.class);
  }

  private HttpClientResponseException postFails(String path, Map<String, Object> body) {
    return assertThrows(HttpClientResponseException.class, () -> post(path, body));
  }

  private String register(String u) {
    post("/api/auth/register", Map.of("username", "ana_" + u, "email", "ana" + u + "@mail.com", "password", "0123456789"));
    return "ana" + u + "@mail.com";
  }

  /** El envío es asíncrono: espera un rato acotado a que llegue el correo y devuelve el token de su enlace. */
  private String tokenSentTo(String email) throws InterruptedException {
    for (int i = 0; i < 100; i++) {
      List<MailMessage> sent = mail.sentTo(email);
      if (!sent.isEmpty()) return RecordingMailSender.tokenOf(sent.get(sent.size() - 1));
      Thread.sleep(50);
    }
    throw new AssertionError("No llegó el correo a " + email);
  }

  private String requestToken(String email) throws InterruptedException {
    var res = post("/api/auth/password/forgot", Map.of("identifier", email));
    assertEquals(HttpStatus.NO_CONTENT, res.getStatus());
    return tokenSentTo(email);
  }

  @Test
  void forgotIs204ForExistingAndUnknownAccounts() {
    var u = unique();
    var email = register(u);
    var known = post("/api/auth/password/forgot", Map.of("identifier", email));
    var unknown = post("/api/auth/password/forgot", Map.of("identifier", "nadie" + u + "@mail.com"));
    assertEquals(HttpStatus.NO_CONTENT, known.getStatus());
    assertEquals(known.getStatus(), unknown.getStatus());
    assertTrue(known.getBody().isEmpty());
    assertTrue(unknown.getBody().isEmpty());
  }

  @Test
  @SuppressWarnings("unchecked")
  void forgotWithoutIdentifierIs400InSpanish() {
    var e = postFails("/api/auth/password/forgot", Map.of("identifier", " "));
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    var issue = ((List<Map<String, Object>>) e.getResponse().getBody(Map.class).orElseThrow().get("issues")).get(0);
    assertEquals("identifier", issue.get("path"));
    assertEquals("Escribe tu email o tu nombre de usuario", issue.get("message"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void resetLogsInWithCookie() throws Exception {
    var u = unique();
    var email = register(u);
    var token = requestToken(email);
    var res = post("/api/auth/password/reset", Map.of("token", token, "password", "nuevaclave123"));
    assertEquals(HttpStatus.OK, res.getStatus());
    assertEquals("ana_" + u, ((Map<String, Object>) res.body().get("user")).get("displayName"));
    assertTrue(res.getCookie("pu_session").isPresent());
    var login = post("/api/auth/login", Map.of("identifier", email, "password", "nuevaclave123"));
    assertEquals(HttpStatus.OK, login.getStatus());
  }

  @Test
  void resetWithBadTokenIs400() {
    var e = postFails("/api/auth/password/reset", Map.of("token", "x".repeat(43), "password", "nuevaclave123"));
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    assertEquals(Map.of("error", "Invalid or expired reset link"), e.getResponse().getBody(Map.class).orElseThrow());
  }

  @Test
  @SuppressWarnings("unchecked")
  void resetWithShortPasswordIs400OnPasswordField() {
    var e = postFails("/api/auth/password/reset", Map.of("token", "x".repeat(43), "password", "corta"));
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    var issue = ((List<Map<String, Object>>) e.getResponse().getBody(Map.class).orElseThrow().get("issues")).get(0);
    assertEquals("password", issue.get("path"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void resetReplacesAnotherSession() throws Exception {
    var u = unique();
    var email = register(u);
    var token = requestToken(email);
    var guest = post("/api/auth/guest", Map.of("displayName", "Invitado"));
    var guestCookie = guest.getCookie("pu_session").map(Cookie::getValue).orElseThrow();
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/password/reset",
        Map.of("token", token, "password", "nuevaclave123")).cookie(Cookie.of("pu_session", guestCookie)), Map.class);
    var fresh = res.getCookie("pu_session").map(Cookie::getValue).orElseThrow();
    assertNotEquals(guestCookie, fresh);
    var me = client.toBlocking().exchange(HttpRequest.GET("/api/auth/me").cookie(Cookie.of("pu_session", fresh)), Map.class);
    var user = (Map<String, Object>) me.body().get("user");
    assertEquals("ana_" + u, user.get("displayName"));
    assertFalse(((String) user.get("id")).startsWith("guest_"));
  }
}

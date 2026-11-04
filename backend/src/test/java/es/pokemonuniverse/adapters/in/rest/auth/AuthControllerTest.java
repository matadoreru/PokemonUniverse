package es.pokemonuniverse.adapters.in.rest.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.adapters.out.persistence.UserStatsRepository;
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
class AuthControllerTest {

  @Inject @Client("/") HttpClient client;
  @Inject UserRepository users;
  @Inject UserStatsRepository stats;

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

  @SuppressWarnings("unchecked")
  private static Map<String, Object> user(HttpResponse<Map<String, Object>> res) {
    return (Map<String, Object>) res.body().get("user");
  }

  private HttpResponse<Map<String, Object>> register(String name, String email) {
    return post("/api/auth/register", Map.of("username", name, "email", email, "password", "0123456789"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void registerSetsCookieAndReturnsIdentity() {
    var u = unique();
    var res = register("ana_" + u, " Ana" + u + "@Mail.com ");
    assertEquals(HttpStatus.CREATED, res.getStatus());
    var user = user(res);
    assertEquals("ana" + u + "@mail.com", user.get("email"));
    assertEquals("ana_" + u, user.get("displayName"));
    assertEquals("USER", user.get("kind"));
    assertEquals("USER", user.get("role"));
    assertTrue(stats.existsById((String) user.get("id")));
    assertTrue(users.findByEmail("ana" + u + "@mail.com").isPresent());
    assertEquals("DEFAULT", ((Map<String, Object>) user.get("avatar")).get("type"));
    String setCookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow();
    assertTrue(setCookie.toLowerCase().contains("httponly"), setCookie);
    assertTrue(setCookie.contains("SameSite=Lax"), setCookie);
    assertTrue(setCookie.contains("Path=/"), setCookie);
    assertTrue(setCookie.contains("Max-Age=2592000"), setCookie);
  }

  @Test
  void duplicateEmailIs409() {
    var u = unique();
    register("ana_" + u, "ana" + u + "@mail.com");
    var e = postFails("/api/auth/register",
        Map.of("username", "otro_" + u, "email", "ANA" + u + "@mail.com", "password", "0123456789"));
    assertEquals(HttpStatus.CONFLICT, e.getStatus());
    assertEquals(Map.of("error", "Email or username already in use"), e.getResponse().getBody(Map.class).orElseThrow());
  }

  @Test
  void duplicateUsernameIs409() {
    var u = unique();
    register("ana_" + u, "ana" + u + "@mail.com");
    var e = postFails("/api/auth/register",
        Map.of("username", "ana_" + u, "email", "otro" + u + "@mail.com", "password", "0123456789"));
    assertEquals(HttpStatus.CONFLICT, e.getStatus());
  }

  @Test
  @SuppressWarnings("unchecked")
  void shortPasswordIs400WithIssuePath() {
    var u = unique();
    var e = postFails("/api/auth/register",
        Map.of("username", "ana_" + u, "email", "ana" + u + "@mail.com", "password", "corta"));
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    var body = e.getResponse().getBody(Map.class).orElseThrow();
    assertEquals("password", ((Map<String, Object>) ((List<?>) body.get("issues")).get(0)).get("path"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void invalidEmailAndUsernameAreReportedByField() {
    var e = postFails("/api/auth/register", Map.of("username", "a!", "email", "nope", "password", "0123456789"));
    assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
    var paths = ((List<Map<String, Object>>) e.getResponse().getBody(Map.class).orElseThrow().get("issues"))
        .stream().map(i -> i.get("path")).toList();
    assertTrue(paths.contains("username") && paths.contains("email"), paths.toString());
  }

  @Test
  void loginWrongPasswordIs401() {
    var u = unique();
    register("ana_" + u, "ana" + u + "@mail.com");
    var e = postFails("/api/auth/login", Map.of("email", "ana" + u + "@mail.com", "password", "incorrecta"));
    assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus());
    assertEquals(Map.of("error", "Invalid email or password"), e.getResponse().getBody(Map.class).orElseThrow());
  }

  @Test
  void loginUnknownEmailIs401WithSameMessage() {
    var e = postFails("/api/auth/login", Map.of("email", "nadie" + unique() + "@mail.com", "password", "x"));
    assertEquals(HttpStatus.UNAUTHORIZED, e.getStatus());
    assertEquals("Invalid email or password", e.getResponse().getBody(Map.class).orElseThrow().get("error"));
  }

  @Test
  void loginNormalizesEmail() {
    var u = unique();
    register("ana_" + u, "ana" + u + "@mail.com");
    var res = post("/api/auth/login", Map.of("email", " ANA" + u + "@mail.com ", "password", "0123456789"));
    assertEquals(HttpStatus.OK, res.getStatus());
    assertEquals("ana_" + u, user(res).get("displayName"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void guestIdentity() {
    var res = post("/api/auth/guest", Map.of("displayName", "Ana 2"));
    assertEquals(HttpStatus.CREATED, res.getStatus());
    var user = user(res);
    assertTrue(((String) user.get("id")).startsWith("guest_"));
    assertFalse(users.existsById((String) user.get("id")));
    assertFalse(stats.existsById((String) user.get("id")));
    assertEquals("GUEST", user.get("kind"));
    assertEquals(Map.of("type", "DEFAULT"), user.get("avatar"));
    assertTrue(res.getHeaders().getAll("Set-Cookie").stream().anyMatch(c -> c.startsWith("pu_session=")));
  }

  @Test
  void guestWithFormerPresetAvatarIs400() {
    // Los avatares predefinidos ya no existen: pedir uno, aunque fuera válido antes, es un error de validación.
    for (var preset : List.of("trainer-berry", "nope")) {
      var e = postFails("/api/auth/guest", Map.of("displayName", "Ana", "avatarPresetId", preset));
      assertEquals(HttpStatus.BAD_REQUEST, e.getStatus());
      var body = e.getResponse().getBody(String.class).orElseThrow();
      assertEquals("{\"error\":\"El avatar no es válido\",\"issues\":[{\"path\":\"avatarPresetId\","
          + "\"message\":\"El avatar no es válido\"}]}", body);
    }
  }

  @Test
  void meWithoutCookieIsNullUser() {
    var res = client.toBlocking().exchange(HttpRequest.GET("/api/auth/me"), String.class);
    assertEquals(HttpStatus.OK, res.getStatus());
    assertEquals("{\"user\":null}", res.body());
  }

  @Test
  void meWithCookieReturnsIdentity() {
    var u = unique();
    var reg = register("ana_" + u, "ana" + u + "@mail.com");
    var cookie = reg.getCookie("pu_session").map(Cookie::getValue).orElseThrow();
    var res = client.toBlocking().exchange(
        HttpRequest.GET("/api/auth/me").cookie(Cookie.of("pu_session", cookie)), Map.class);
    assertEquals(HttpStatus.OK, res.getStatus());
    assertEquals(user(reg).get("id"), ((Map<?, ?>) res.body().get("user")).get("id"));
    assertNotNull(user(reg).get("id"));
  }

  @Test
  void logoutClearsCookie() {
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/logout", ""), String.class);
    assertEquals(HttpStatus.NO_CONTENT, res.getStatus());
    var setCookie = res.getHeaders().getAll("Set-Cookie").stream()
        .filter(c -> c.startsWith("pu_session=")).findFirst().orElseThrow();
    assertTrue(setCookie.contains("Max-Age=0"), setCookie);
  }

  @Test
  void longPasswordRegistersAndLogsIn() {
    var u = unique();
    var password = "p".repeat(100);
    var res = post("/api/auth/register", Map.of("username", "ana_" + u, "email", "ana" + u + "@mail.com", "password", password));
    assertEquals(HttpStatus.CREATED, res.getStatus());
    var login = post("/api/auth/login", Map.of("email", "ana" + u + "@mail.com", "password", password));
    assertEquals(HttpStatus.OK, login.getStatus());
  }
}

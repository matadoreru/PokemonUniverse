package es.pokemonuniverse.adapters.in.rest.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;

@MicronautTest
class IdentityFilterTest {

  @Inject @Client("/") HttpClient client;
  @Inject IdentityTokens tokens;

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(String path, String cookie) {
    var req = HttpRequest.GET(path);
    if (cookie != null) req = req.cookie(Cookie.of("pu_session", cookie));
    var res = client.toBlocking().exchange(req, Map.class);
    assertEquals(HttpStatus.OK, res.getStatus());
    return res.body();
  }

  @Test
  void validCookieYieldsIdentity() {
    var user = new AuthUser("u9", "Ana", AuthUser.Kind.USER, null, null, new AvatarRef.Default());
    assertEquals("u9", get("/test-identity", tokens.sign(user, Instant.now())).get("id"));
  }

  @Test
  void noCookieIsAnonymous() {
    assertNull(get("/test-identity", null).get("id"));
  }

  @Test
  void corruptCookieIsAnonymousNotUnauthorized() {
    assertNull(get("/test-identity", "garbage.token.value").get("id"));
  }

  @Test
  void authUserJsonOmitsNullEmailAndRoleAndUsesExactAvatarShape() {
    var guest = new AuthUser("g1", "G", AuthUser.Kind.GUEST, null, null, new AvatarRef.Preset("trainer-aqua"));
    var body = get("/test-identity/user", tokens.sign(guest, Instant.now()));
    assertEquals(Map.of("id", "g1", "displayName", "G", "kind", "GUEST",
        "avatar", Map.of("type", "PRESET", "value", "trainer-aqua")), body);
    var custom = new AuthUser("u1", "A", AuthUser.Kind.USER, "a@b.c", es.pokemonuniverse.domain.identity.UserRole.ADMIN,
        new AvatarRef.Custom("0123456789abcdef0123456789abcdef0123.webp", 42));
    var body2 = get("/test-identity/user", tokens.sign(custom, Instant.now()));
    assertEquals(Map.of("type", "CUSTOM", "value", "0123456789abcdef0123456789abcdef0123.webp", "version", 42),
        body2.get("avatar"));
    assertEquals("ADMIN", body2.get("role"));
    assertEquals("a@b.c", body2.get("email"));
    assertEquals(Map.of("type", "DEFAULT"),
        get("/test-identity/user", tokens.sign(new AuthUser("d", "D", AuthUser.Kind.GUEST, null, null, new AvatarRef.Default()), Instant.now())).get("avatar"));
  }

  @Test
  void sessionCookieHasExpectedAttributes() {
    var res = client.toBlocking().exchange(HttpRequest.GET("/test-identity/login"), String.class);
    var set = res.getHeaders().get("Set-Cookie");
    assertTrue(set.contains("pu_session=abc"), set);
    assertTrue(set.toLowerCase().contains("httponly"), set);
    assertTrue(set.contains("SameSite=Lax"), set);
    assertTrue(set.contains("Path=/"), set);
    assertTrue(set.contains("Max-Age=2592000"), set);
    assertFalse(set.contains("Secure"), set);
    var cleared = client.toBlocking().exchange(HttpRequest.GET("/test-identity/logout"), String.class)
        .getHeaders().get("Set-Cookie");
    assertTrue(cleared.contains("pu_session=;") || cleared.contains("pu_session=\"\"") || cleared.endsWith("pu_session="), cleared);
    assertTrue(cleared.contains("Max-Age=0"), cleared);
    assertTrue(cleared.toLowerCase().contains("httponly") && cleared.contains("Path=/") && cleared.contains("SameSite=Lax"), cleared);
  }
}

package es.pokemonuniverse.adapters.in.rest.auth;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.identity.UserRole;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.test.support.TestPropertyProvider;
import jakarta.inject.Inject;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

@MicronautTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AvatarRoutesTest implements TestPropertyProvider {

  private Path dir;

  @Inject @Client("/") HttpClient client;
  @Inject IdentityTokens tokens;

  @Override
  public Map<String, String> getProperties() {
    try {
      dir = Files.createTempDirectory("pu-avatars");
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
    return Map.of("pu.avatar-storage-dir", dir.toString());
  }

  private static String name() {
    return UUID.randomUUID() + ".webp";
  }

  private Path write(String file) throws IOException {
    return Files.write(dir.resolve(file), new byte[] {9, 8, 7});
  }

  private String cookieFor(AuthUser.Kind kind, String file) {
    var user = new AuthUser(kind == AuthUser.Kind.GUEST ? "guest_" + UUID.randomUUID() : UUID.randomUUID().toString(),
        "Ash", kind, null, kind == AuthUser.Kind.USER ? UserRole.USER : null, new AvatarRef.Custom(file, 1));
    return tokens.sign(user, Instant.now());
  }

  private HttpClientResponseException getFails(String path) {
    return assertThrows(HttpClientResponseException.class, () -> client.toBlocking().exchange(HttpRequest.GET(path), byte[].class));
  }

  @Test
  void avatarRouteServesWebp() throws IOException {
    var file = name();
    write(file);
    var res = client.toBlocking().exchange(HttpRequest.GET("/api/auth/avatars/" + file), byte[].class);
    assertEquals(HttpStatus.OK, res.getStatus());
    assertEquals("image/webp", res.getHeaders().get("Content-Type"));
    assertEquals("public, max-age=31536000, immutable", res.getHeaders().get("Cache-Control"));
    assertArrayEquals(new byte[] {9, 8, 7}, res.body());
  }

  @Test
  void avatarRouteInvalidNameIs404() {
    assertEquals(HttpStatus.NOT_FOUND, getFails("/api/auth/avatars/abc.png").getStatus());
    assertEquals(HttpStatus.NOT_FOUND, getFails("/api/auth/avatars/..%2Fx.webp").getStatus());
  }

  @Test
  void avatarRouteMissingIs404() {
    assertEquals(HttpStatus.NOT_FOUND, getFails("/api/auth/avatars/" + name()).getStatus());
  }

  @Test
  void logoutRemovesGuestCustomAvatar() throws IOException {
    var file = name();
    var path = write(file);
    var res = client.toBlocking().exchange(
        HttpRequest.POST("/api/auth/logout", "").cookie(Cookie.of("pu_session", cookieFor(AuthUser.Kind.GUEST, file))));
    assertEquals(HttpStatus.NO_CONTENT, res.getStatus());
    assertFalse(Files.exists(path));
  }

  @Test
  void guestRemovesPriorGuestCustomAvatar() throws IOException {
    var file = name();
    var path = write(file);
    var res = client.toBlocking().exchange(
        HttpRequest.POST("/api/auth/guest", Map.of("displayName", "Misty"))
            .cookie(Cookie.of("pu_session", cookieFor(AuthUser.Kind.GUEST, file))));
    assertEquals(HttpStatus.CREATED, res.getStatus());
    assertFalse(Files.exists(path));
  }

  @Test
  void logoutKeepsUserCustomAvatar() throws IOException {
    var file = name();
    var path = write(file);
    client.toBlocking().exchange(
        HttpRequest.POST("/api/auth/logout", "").cookie(Cookie.of("pu_session", cookieFor(AuthUser.Kind.USER, file))));
    assertTrue(Files.exists(path));
  }
}

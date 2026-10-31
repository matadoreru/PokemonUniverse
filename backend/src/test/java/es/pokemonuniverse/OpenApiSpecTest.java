package es.pokemonuniverse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

@MicronautTest
class OpenApiSpecTest {

  static final String SPEC = "pokemon-universe.yml";

  @Inject
  @Client("/")
  HttpClient client;

  @Test
  void specListsEtapaOnePaths() throws IOException {
    try (InputStream in = getClass().getClassLoader().getResourceAsStream("META-INF/swagger/" + SPEC)) {
      assertNotNull(in, "falta la especificación generada");
      Map<String, Object> spec = new Yaml().load(in);
      @SuppressWarnings("unchecked")
      Map<String, Object> paths = (Map<String, Object>) spec.get("paths");
      assertEquals(Set.of("/api/auth/register", "/api/auth/login", "/api/auth/guest", "/api/auth/logout",
          "/api/auth/me", "/api/auth/profile", "/api/auth/avatars/{filename}", "/api/changelog", "/api/feedback",
          "/api/games", "/api/pokemon"), paths.keySet());
    }
  }

  @Test
  void swaggerSpecIsServedInTest() {
    var response = client.toBlocking().exchange(HttpRequest.GET("/swagger/" + SPEC), String.class);
    assertEquals(HttpStatus.OK, response.status());
    assertTrue(response.body().contains("/api/games"));
  }

  @Test
  void swaggerUiIsServedInTest() {
    var response = client.toBlocking().exchange(HttpRequest.GET("/swagger-ui/index.html"), String.class);
    assertEquals(HttpStatus.OK, response.status());
  }

  @Test
  void prodDisablesSwaggerResources() throws IOException {
    try (InputStream in = getClass().getClassLoader().getResourceAsStream("application-prod.yml")) {
      assertNotNull(in);
      Map<String, Object> prod = new Yaml().load(in);
      @SuppressWarnings("unchecked")
      Map<String, Object> micronaut = (Map<String, Object>) prod.get("micronaut");
      @SuppressWarnings("unchecked")
      Map<String, Object> router = (Map<String, Object>) micronaut.get("router");
      @SuppressWarnings("unchecked")
      Map<String, Object> statics = (Map<String, Object>) router.get("static-resources");
      for (String key : new String[] {"swagger", "swagger-ui"}) {
        @SuppressWarnings("unchecked")
        Map<String, Object> entry = (Map<String, Object>) statics.get(key);
        assertEquals(false, entry.get("enabled"), key);
      }
    }
  }
}

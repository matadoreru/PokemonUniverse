package es.pokemonuniverse.adapters.in.rest.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.context.annotation.Property;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.util.Map;
import org.junit.jupiter.api.Test;

@MicronautTest
@Property(name = "pu.rate-limit-disabled", value = "false")
class RateLimitFilterTest {

  @Inject @Client("/") HttpClient client;

  private HttpResponse<String> call(HttpRequest<?> request) {
    try {
      return client.toBlocking().exchange(request, String.class);
    } catch (HttpClientResponseException e) {
      @SuppressWarnings("unchecked")
      var response = (HttpResponse<String>) e.getResponse();
      return response;
    }
  }

  private HttpResponse<String> login(String ip) {
    return call(HttpRequest.POST("/api/auth/login", Map.of("username", "")).header("X-Forwarded-For", ip));
  }

  @Test
  void authLimitIs30() {
    for (int i = 0; i < 30; i++) {
      var r = login("203.0.113.7");
      assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, r.status(), "request " + (i + 1));
    }
    var limited = login("203.0.113.7");
    assertEquals(HttpStatus.TOO_MANY_REQUESTS, limited.status());
    assertEquals("{\"error\":\"Too many requests\"}", limited.body());
    assertEquals("30", limited.header("RateLimit-Limit"));
    assertEquals("0", limited.header("RateLimit-Remaining"));
    assertTrue(Long.parseLong(limited.header("RateLimit-Reset")) <= 900);
  }

  @Test
  void avatarsAreExemptFromAuthLimit() {
    for (int i = 0; i < 40; i++) {
      var r = call(HttpRequest.GET("/api/auth/avatars/11111111-1111-1111-1111-111111111111.webp")
          .header("X-Forwarded-For", "203.0.113.8"));
      assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, r.status());
      assertEquals("120", r.header("RateLimit-Limit"));
    }
  }

  @Test
  void remainingHeaderDecreases() {
    var first = call(HttpRequest.GET("/api/games").header("X-Forwarded-For", "203.0.113.9"));
    var second = call(HttpRequest.GET("/api/games").header("X-Forwarded-For", "203.0.113.9"));
    assertEquals("119", first.header("RateLimit-Remaining"));
    assertEquals("118", second.header("RateLimit-Remaining"));
  }

  @Test
  void passwordResetForgotAllowsFivePerIpThenReturns429() {
    HttpResponse<String> last = null;
    for (int i = 0; i < 6; i++) {
      last = call(HttpRequest.POST("/api/auth/password/forgot", Map.of("identifier", "nadie@mail.com"))
          .header("X-Forwarded-For", "203.0.113.20"));
      if (i < 5) {
        assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, last.status());
      }
    }
    assertEquals(HttpStatus.TOO_MANY_REQUESTS, last.status());
    assertEquals("5", last.header("RateLimit-Limit"));
  }

  @Test
  void friendRequestsRateLimitIs20PerIp() {
    HttpResponse<String> last = null;
    for (int i = 0; i < 21; i++) {
      last = call(HttpRequest.POST("/api/friends/requests", Map.of("username", "nadie"))
          .header("X-Forwarded-For", "203.0.113.30"));
      if (i < 20) {
        assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, last.status());
      }
    }
    assertEquals(HttpStatus.TOO_MANY_REQUESTS, last.status());
    assertEquals("20", last.header("RateLimit-Limit"));
  }

  @Test
  void feedbackLimitIs10() {
    HttpResponse<String> last = null;
    for (int i = 0; i < 11; i++) {
      last = call(HttpRequest.POST("/api/feedback", Map.of("message", "")).header("X-Forwarded-For", "203.0.113.10"));
      if (i < 10) {
        assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, last.status());
      }
    }
    assertEquals(HttpStatus.TOO_MANY_REQUESTS, last.status());
    assertEquals("10", last.header("RateLimit-Limit"));
  }

  @Test
  void nonApiPathsAreNotLimited() {
    var r = call(HttpRequest.GET("/health").header("X-Forwarded-For", "203.0.113.11"));
    assertNull(r.header("RateLimit-Limit"));
  }

  /** Las imágenes y gritos de ronda quedan fuera del límite global y bajo uno propio de 5000/min (constraint 17). */
  @Test
  void gameAssetsHaveTheirOwn5000Limit() {
    var path = "/api/rooms/ABC123/games/t/rounds/1/options/a/sprite";
    for (int i = 0; i < 5000; i++) {
      var r = call(HttpRequest.GET(path).header("X-Forwarded-For", "203.0.113.12"));
      assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, r.status(), "request " + (i + 1));
      if (i == 0) assertEquals("5000", r.header("RateLimit-Limit"));
    }
    var limited = call(HttpRequest.GET(path).header("X-Forwarded-For", "203.0.113.12"));
    assertEquals(HttpStatus.TOO_MANY_REQUESTS, limited.status());
    assertEquals("5000", limited.header("RateLimit-Limit"));
    // El resto de la API de esa IP conserva su presupuesto global intacto.
    var games = call(HttpRequest.GET("/api/games").header("X-Forwarded-For", "203.0.113.12"));
    assertEquals("119", games.header("RateLimit-Remaining"));
  }
}

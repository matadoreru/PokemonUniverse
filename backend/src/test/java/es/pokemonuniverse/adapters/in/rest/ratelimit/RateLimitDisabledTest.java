package es.pokemonuniverse.adapters.in.rest.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

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

/** El perfil test desactiva el límite (pu.rate-limit-disabled=true) y el entorno no es prod. */
@MicronautTest
class RateLimitDisabledTest {

  @Inject @Client("/") HttpClient client;

  @Test
  void disabledFlagSkipsInTest() {
    for (int i = 0; i < 31; i++) {
      HttpResponse<?> r;
      try {
        r = client.toBlocking().exchange(HttpRequest.POST("/api/auth/login", Map.of("username", ""))
            .header("X-Forwarded-For", "203.0.113.20"), String.class);
      } catch (HttpClientResponseException e) {
        r = e.getResponse();
      }
      assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, r.status());
      assertNull(r.header("RateLimit-Limit"));
    }
  }
}

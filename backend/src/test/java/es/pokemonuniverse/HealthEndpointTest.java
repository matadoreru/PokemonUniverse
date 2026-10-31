package es.pokemonuniverse;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.micronaut.http.HttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.util.Map;
import org.junit.jupiter.api.Test;

@MicronautTest
class HealthEndpointTest {

  @Inject
  @Client("/")
  HttpClient client;

  @Test
  void healthIsUp() {
    var body = client.toBlocking().retrieve(HttpRequest.GET("/health"), Map.class);
    assertEquals("UP", body.get("status"));
  }
}

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
import java.util.Map;
import org.junit.jupiter.api.Test;

@MicronautTest
class ObservabilityEndpointsTest {

  @Inject
  @Client("/")
  HttpClient client;

  @Test
  void prometheusExposesHttpMetrics() {
    client.toBlocking().retrieve(HttpRequest.GET("/health"), Map.class);
    var response = client.toBlocking().exchange(HttpRequest.GET("/prometheus"), String.class);
    assertEquals(HttpStatus.OK, response.status());
    var body = response.body();
    assertNotNull(body);
    assertTrue(body.contains("http_server_requests_seconds"));
    assertTrue(body.contains("jvm_memory_used_bytes"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void readinessIncludesDatabase() {
    var response = client.toBlocking().exchange(HttpRequest.GET("/health/readiness"), Map.class);
    assertEquals(HttpStatus.OK, response.status());
    var details = (Map<String, Object>) response.body().get("details");
    assertNotNull(details);
    assertTrue(details.containsKey("jdbc"));
  }

  @Test
  void livenessIsUp() {
    var response = client.toBlocking().exchange(HttpRequest.GET("/health/liveness"), Map.class);
    assertEquals(HttpStatus.OK, response.status());
  }
}

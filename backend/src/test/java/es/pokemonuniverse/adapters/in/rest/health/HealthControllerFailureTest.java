package es.pokemonuniverse.adapters.in.rest.health;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.application.health.SchemaVersionReader;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.junit.jupiter.api.Test;

@MicronautTest
@Property(name = "test.health.failing", value = "true")
class HealthControllerFailureTest {

  @Inject @Client("/") HttpClient client;

  @Singleton
  @Requires(property = "test.health.failing", value = "true")
  @Replaces(SchemaVersionReader.class)
  static class FailingReader implements SchemaVersionReader {
    @Override
    public String latestMigration() {
      throw new IllegalStateException();
    }
  }

  @Test
  void databaseFailureIsAGeneric500() {
    var e = assertThrows(HttpClientResponseException.class,
        () -> client.toBlocking().exchange(HttpRequest.GET("/api/health"), String.class));
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, e.getStatus());
    assertEquals("{\"error\":\"Internal server error\"}", e.getResponse().getBody(String.class).orElseThrow());
  }
}

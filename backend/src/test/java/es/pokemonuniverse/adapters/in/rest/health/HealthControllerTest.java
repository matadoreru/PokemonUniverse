package es.pokemonuniverse.adapters.in.rest.health;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.core.type.Argument;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * La BD de Test Resources la crea Flyway desde vacía ({@code V1__baseline.sql}), así que {@code schemaVersion} es
 * {@code "1 baseline"}. Los casos de baseline sobre Prisma, {@code V2}, fallback a Prisma y {@code unknown} están en
 * {@code FlywayMigrationsTest}, con BD propias.
 */
@MicronautTest(transactional = false)
class HealthControllerTest {

  @Inject @Client("/") HttpClient client;
  @Inject ObjectMapper om;

  @Test
  void reportsSixKeysInOrderWithTheFlywayVersion() throws Exception {
    var body = client.toBlocking().retrieve(HttpRequest.GET("/api/health"), String.class);
    var map = om.readValue(body, Argument.mapOf(Argument.STRING, Argument.OBJECT_ARGUMENT));
    assertEquals(List.of("status", "database", "schemaVersion", "uptimeSeconds", "commit", "timestamp"),
        new ArrayList<>(map.keySet()));
    assertEquals("ok", map.get("status"));
    assertEquals("ready", map.get("database"));
    assertEquals("1 baseline", map.get("schemaVersion"));
    assertEquals("development", map.get("commit"));
    assertTrue(((Number) map.get("uptimeSeconds")).longValue() >= 0);
    assertTrue(map.get("timestamp").toString().matches("\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z"));
  }
}

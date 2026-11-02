package es.pokemonuniverse.adapters.in.rest.health;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.core.type.Argument;
import io.micronaut.http.HttpRequest;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.sql.SQLException;
import java.util.ArrayList;
import javax.sql.DataSource;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

@MicronautTest(transactional = false)
class HealthControllerTest {

  @Inject @Client("/") HttpClient client;
  @Inject ObjectMapper om;
  @Inject DataSource dataSource;
  @Inject io.micronaut.jdbc.DataSourceResolver resolver;

  @BeforeEach
  void table() throws SQLException {
    execute("drop table if exists \"_prisma_migrations\"");
    execute("create table \"_prisma_migrations\" (migration_name varchar(255) not null, finished_at timestamptz)");
    execute("insert into \"_prisma_migrations\" values ('20260101_old', '2026-01-01T00:00:00Z'),"
        + " ('20260301_latest', '2026-03-01T00:00:00Z'), ('20260401_unfinished', null)");
  }

  @AfterEach
  void drop() throws SQLException {
    execute("drop table if exists \"_prisma_migrations\"");
  }

  @Test
  void reportsSixKeysInOrderWithLatestFinishedMigration() throws Exception {
    var body = client.toBlocking().retrieve(HttpRequest.GET("/api/health"), String.class);
    var map = om.readValue(body, Argument.mapOf(Argument.STRING, Argument.OBJECT_ARGUMENT));
    assertEquals(java.util.List.of("status", "database", "schemaVersion", "uptimeSeconds", "commit", "timestamp"),
        new ArrayList<>(map.keySet()));
    assertEquals("ok", map.get("status"));
    assertEquals("ready", map.get("database"));
    assertEquals("20260301_latest", map.get("schemaVersion"));
    assertEquals("development", map.get("commit"));
    assertTrue(((Number) map.get("uptimeSeconds")).longValue() >= 0);
    assertTrue(map.get("timestamp").toString().matches("\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z"));
  }

  @Test
  void schemaVersionIsUnknownWithoutFinishedMigrations() throws Exception {
    execute("delete from \"_prisma_migrations\" where finished_at is not null");
    var body = client.toBlocking().retrieve(HttpRequest.GET("/api/health"), String.class);
    assertTrue(body.contains("\"schemaVersion\":\"unknown\""), body);
  }

  private void execute(String sql) throws SQLException {
    try (var c = resolver.resolve(dataSource).getConnection(); var s = c.createStatement()) {
      s.execute(sql);
    }
  }
}

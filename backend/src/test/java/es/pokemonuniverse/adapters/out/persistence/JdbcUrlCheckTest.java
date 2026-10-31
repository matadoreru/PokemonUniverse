package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.context.ApplicationContext;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JdbcUrlCheckTest {

  @Test
  void failsFastWhenUrlIsNotJdbcPostgres() {
    var ex =
        assertThrows(
            Exception.class,
            () ->
                ApplicationContext.run(
                    Map.of(
                        "datasources.default.url", "postgresql://pokemon:x@postgres:5432/db",
                        "datasources.default.username", "pokemon",
                        "datasources.default.password", "x",
                        "test-resources.enabled", false),
                    "test"));
    Throwable t = ex;
    var found = false;
    while (t != null) {
      if (t.getMessage() != null
          && t.getMessage().contains("JDBC_URL debe empezar por jdbc:postgresql://")) {
        found = true;
      }
      t = t.getCause();
    }
    assertTrue(found, "mensaje esperado no encontrado en: " + ex);
  }
}

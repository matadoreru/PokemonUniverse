package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;

@MicronautTest
class SchemaBaselineTest {

  @Inject DataSource dataSource;

  @Test
  void baselineCreatesPrismaTables() throws SQLException {
    try (var c = dataSource.getConnection();
        var rs =
            c.createStatement()
                .executeQuery(
                    "select count(*) from information_schema.tables where table_schema='public'"
                        + " and table_name in ('User','Feedback','Changelog','Pokemon','UserGameStats')")) {
      rs.next();
      assertEquals(5, rs.getInt(1));
    }
  }

  @Test
  void baselineRegistersFlywayVersionOne() throws SQLException {
    try (var c = dataSource.getConnection();
        var rs =
            c.createStatement()
                .executeQuery(
                    "select count(*) from flyway_schema_history where success and version = '1'")) {
      rs.next();
      assertTrue(rs.getInt(1) >= 1);
    }
  }
}

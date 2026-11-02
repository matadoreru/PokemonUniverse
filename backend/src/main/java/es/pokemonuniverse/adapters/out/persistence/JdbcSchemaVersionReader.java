package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.health.SchemaVersionReader;
import io.micronaut.jdbc.DataSourceResolver;
import jakarta.inject.Singleton;
import java.sql.SQLException;
import javax.sql.DataSource;

/** {@code SELECT 1} y última migración de {@code _prisma_migrations} (como {@code /api/health} de Node). */
@Singleton
public class JdbcSchemaVersionReader implements SchemaVersionReader {

  private static final String LATEST =
      "SELECT migration_name FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1";

  private final DataSource dataSource;

  public JdbcSchemaVersionReader(DataSource dataSource, DataSourceResolver resolver) {
    this.dataSource = resolver.resolve(dataSource);
  }

  @Override
  public String latestMigration() {
    try (var connection = dataSource.getConnection();
        var statement = connection.createStatement()) {
      statement.execute("SELECT 1");
      try (var rs = statement.executeQuery(LATEST)) {
        return rs.next() ? rs.getString(1) : UNKNOWN;
      }
    } catch (SQLException e) {
      throw new IllegalStateException("No se pudo leer la versión del esquema", e);
    }
  }
}

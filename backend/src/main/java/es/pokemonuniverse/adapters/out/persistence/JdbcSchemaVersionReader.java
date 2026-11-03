package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.health.SchemaVersionReader;
import io.micronaut.jdbc.DataSourceResolver;
import jakarta.inject.Singleton;
import java.sql.SQLException;
import java.sql.Statement;
import javax.sql.DataSource;

/**
 * {@code SELECT 1} y la versión del esquema: la última migración correcta de {@code flyway_schema_history}
 * («{@code <versión> <descripción>}», p. ej. {@code 1 baseline} o {@code 2 add x}; la fila de baseline de una BD creada
 * por Prisma, «{@code << Flyway Baseline >>}», también se muestra como {@code 1 baseline}). Si la tabla de Flyway no
 * existe o no tiene filas, la última de {@code _prisma_migrations} (como {@code /api/health} de Node); si tampoco,
 * {@code unknown}.
 */
@Singleton
public class JdbcSchemaVersionReader implements SchemaVersionReader {

  private static final String FLYWAY_LATEST =
      "SELECT version || ' ' || CASE WHEN type = 'BASELINE' THEN 'baseline' ELSE description END"
          + " FROM flyway_schema_history WHERE success AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1";
  private static final String PRISMA_LATEST =
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
      var flyway = latest(statement, "flyway_schema_history", FLYWAY_LATEST);
      if (flyway != null) {
        return flyway;
      }
      var prisma = latest(statement, "_prisma_migrations", PRISMA_LATEST);
      return prisma != null ? prisma : UNKNOWN;
    } catch (SQLException e) {
      throw new IllegalStateException("No se pudo leer la versión del esquema", e);
    }
  }

  /** {@code null} si la tabla no existe (se comprueba antes: un fallo real de la BD sí se propaga) o está vacía. */
  private static String latest(Statement statement, String table, String query) throws SQLException {
    try (var rs = statement.executeQuery("SELECT to_regclass('public.\"" + table + "\"')")) {
      if (!rs.next() || rs.getString(1) == null) {
        return null;
      }
    }
    try (var rs = statement.executeQuery(query)) {
      return rs.next() ? rs.getString(1) : null;
    }
  }
}

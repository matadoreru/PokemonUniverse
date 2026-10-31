package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.context.annotation.Context;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.exceptions.ConfigurationException;
import io.micronaut.jdbc.DataSourceResolver;
import jakarta.annotation.PostConstruct;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;

/**
 * Flyway nunca crea el esquema fuera de los tests. {@code baseline-on-migrate} solo actúa sobre un esquema con
 * tablas: en una BD vacía Flyway ejecutaría {@code V1__baseline.sql} sin {@code _prisma_migrations} y después
 * {@code prisma migrate deploy} de Node fallaría (P3005). Por eso la migración automática de Micronaut está desactivada
 * salvo en {@code test} (Test Resources parte de una BD vacía) y este bean, al arrancar, exige que Prisma ya haya
 * migrado y solo entonces ejecuta Flyway con baseline en la versión 1.
 */
@Context
@Requires(notEnv = "test")
@Requires(beans = DataSource.class)
public class PrismaSchemaGuard {

  static final String MISSING_PRISMA =
      "La base de datos no tiene migraciones de Prisma aplicadas; arranca primero el servidor Node (prisma migrate deploy)";

  private final DataSource dataSource;

  /** El resolver desenvuelve el proxy de conexión contextual (fuera de una transacción no da conexiones). */
  public PrismaSchemaGuard(DataSource dataSource, DataSourceResolver resolver) {
    this.dataSource = resolver.resolve(dataSource);
  }

  @PostConstruct
  void migrate() {
    requirePrismaMigrations();
    Flyway.configure()
        .dataSource(dataSource)
        .baselineOnMigrate(true)
        .baselineVersion("1")
        .validateOnMigrate(true)
        .load()
        .migrate();
  }

  void requirePrismaMigrations() {
    try (var connection = dataSource.getConnection();
        var statement = connection.createStatement();
        var rs = statement.executeQuery("select to_regclass('public.\"_prisma_migrations\"')")) {
      if (!rs.next() || rs.getString(1) == null) {
        throw new ConfigurationException(MISSING_PRISMA);
      }
    } catch (SQLException e) {
      throw new ConfigurationException("No se pudo comprobar el esquema de Prisma: " + e.getMessage(), e);
    }
  }
}

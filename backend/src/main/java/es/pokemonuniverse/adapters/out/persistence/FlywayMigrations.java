package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.context.annotation.Context;
import io.micronaut.context.annotation.Requires;
import io.micronaut.jdbc.DataSourceResolver;
import jakarta.annotation.PostConstruct;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;

/**
 * Flyway es el único dueño del esquema: al arrancar migra la BD antes de que los beans de datos la usen (los que
 * escriben al arrancar inyectan este bean para forzar el orden). Tres casos:
 * <ul>
 *   <li>BD vacía: ejecuta {@code V1__baseline.sql} (el esquema completo) y las {@code V2__…} posteriores.</li>
 *   <li>BD creada por Prisma con {@code flyway_schema_history}: no hace nada salvo las migraciones nuevas.</li>
 *   <li>BD creada por Prisma sin {@code flyway_schema_history}: {@code baseline-on-migrate} la registra en la
 *       versión 1 sin ejecutar {@code V1} (solo actúa sobre un esquema con tablas).</li>
 * </ul>
 * En {@code test} la migración la hace Flyway de Micronaut ({@code application-test.yml}) sobre la BD vacía de Test
 * Resources, sin baseline (no hace falta: la BD parte vacía).
 */
@Context
@Requires(notEnv = "test")
@Requires(beans = DataSource.class)
public class FlywayMigrations {

  private final DataSource dataSource;

  /** El resolver desenvuelve el proxy de conexión contextual (fuera de una transacción no da conexiones). */
  public FlywayMigrations(DataSource dataSource, DataSourceResolver resolver) {
    this.dataSource = resolver.resolve(dataSource);
  }

  @PostConstruct
  void migrate() {
    migrate(dataSource);
  }

  static void migrate(DataSource dataSource) {
    configure(dataSource).load().migrate();
  }

  /** Los ajustes de producción; los tests los reutilizan (p. ej. con {@code target("1")} o más ubicaciones). */
  static FluentConfiguration configure(DataSource dataSource) {
    return Flyway.configure()
        .dataSource(dataSource)
        .baselineOnMigrate(true)
        .baselineVersion("1")
        .validateOnMigrate(true)
        .cleanDisabled(true);
  }
}

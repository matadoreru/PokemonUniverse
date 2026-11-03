package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.context.annotation.Context;
import io.micronaut.context.annotation.Requires;
import io.micronaut.jdbc.DataSourceResolver;
import jakarta.annotation.PostConstruct;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;

/**
 * Flyway es el único dueño del esquema: al arrancar migra la BD antes de que los beans de datos la usen (los que
 * escriben al arrancar inyectan este bean para forzar el orden). Tres casos:
 * <ul>
 *   <li>BD vacía: ejecuta {@code V1__baseline.sql} (el esquema completo) y las {@code V2__…} posteriores.</li>
 *   <li>BD creada por Prisma con {@code flyway_schema_history}: no hace nada salvo las migraciones nuevas.</li>
 *   <li>BD creada por Prisma sin {@code flyway_schema_history}: {@code baseline-on-migrate} la registra en la
 *       versión 1 sin ejecutar {@code V1} (solo actúa sobre un esquema con tablas).</li>
 * </ul>
 * En {@code test} la migración la hace Flyway de Micronaut sobre la BD vacía de Test Resources, con los mismos ajustes.
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

  /** Mismos ajustes que {@code flyway.datasources.default} de {@code application.yml}. */
  static void migrate(DataSource dataSource) {
    Flyway.configure()
        .dataSource(dataSource)
        .baselineOnMigrate(true)
        .baselineVersion("1")
        .validateOnMigrate(true)
        .load()
        .migrate();
  }
}

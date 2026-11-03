package es.pokemonuniverse.config;

import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.ApplicationEventListener;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.runtime.server.event.ServerStartupEvent;
import jakarta.inject.Singleton;
import java.sql.SQLException;
import javax.sql.DataSource;

/**
 * Lo que había en la BD en el instante en que el servidor HTTP empezó a aceptar conexiones (antes no hay
 * {@code /health/readiness} que consultar). Solo con {@code pu.test.startup-probe}.
 */
@Singleton
@Requires(property = "pu.test.startup-probe", value = "true")
class StartupProbe implements ApplicationEventListener<ServerStartupEvent> {

  /** Recuentos al arrancar el servidor: Pokémon y ejecuciones POKEAPI terminadas y en curso. */
  record Snapshot(long pokemon, long pokeapiCompleted, long pokeapiRunning) {}

  private final DataSource dataSource;
  private volatile Snapshot snapshot;

  StartupProbe(DataSource dataSource, DataSourceResolver resolver) {
    this.dataSource = resolver.resolve(dataSource);
  }

  @Override
  public void onApplicationEvent(ServerStartupEvent event) {
    snapshot = new Snapshot(count("SELECT count(*) FROM \"Pokemon\""),
        count("SELECT count(*) FROM \"DataSyncRun\" WHERE \"source\" = 'POKEAPI' AND \"status\" = 'COMPLETED'"),
        count("SELECT count(*) FROM \"DataSyncRun\" WHERE \"source\" = 'POKEAPI' AND \"status\" = 'RUNNING'"));
  }

  Snapshot snapshot() {
    return snapshot;
  }

  private long count(String sql) {
    try (var connection = dataSource.getConnection(); var statement = connection.createStatement();
        var set = statement.executeQuery(sql)) {
      set.next();
      return set.getLong(1);
    } catch (SQLException e) {
      throw new IllegalStateException(e);
    }
  }
}

package es.pokemonuniverse.config;

import es.pokemonuniverse.application.datasync.DataSyncAdapter;
import es.pokemonuniverse.application.datasync.DataSyncRecords;
import es.pokemonuniverse.application.datasync.DataSyncScheduler;
import es.pokemonuniverse.application.datasync.DataSyncService;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.NextScheduledSync;
import es.pokemonuniverse.application.datasync.PokemonPaletteCount;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.context.annotation.Bean;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.Executors;
import javax.sql.DataSource;

/**
 * Construcción del data-sync ({@code index.ts}): el servicio con los adaptadores presentes (pueden faltar mientras no
 * estén portados) y el planificador con el horario de {@code pu.data-sync}. Existen aunque el data-sync esté apagado
 * (el resumen de administración funciona); solo {@link DataSyncStartup} los pone en marcha.
 */
@Factory
@Requires(beans = DataSource.class)
public class DataSyncBeans {

  @Singleton
  @Bean(preDestroy = "stop")
  DataSyncService dataSyncService(DataSyncRecords records, List<DataSyncAdapter> adapters,
      @Nullable PokemonPaletteCount palettes, Clock clock, PuConfig.DataSync config) {
    return new DataSyncService(records, adapters, palettes, clock,
        () -> NextScheduledSync.after(Instant.ofEpochMilli(clock.now()), config.hour(), config.minute(), config.zone()),
        Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("data-sync-", 0).factory()));
  }

  @Singleton
  @Bean(preDestroy = "stop")
  DataSyncScheduler dataSyncScheduler(DataSyncService service, Clock clock, ScheduledSyncTimer timer,
      PuConfig.DataSync config) {
    return new DataSyncScheduler(() -> service.startAll(DataSyncMode.INCREMENTAL), clock, timer, config.hour(),
        config.minute(), config.zone());
  }
}

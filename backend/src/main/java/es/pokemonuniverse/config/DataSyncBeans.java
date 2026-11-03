package es.pokemonuniverse.config;

import es.pokemonuniverse.application.datasync.DataSyncAdapter;
import es.pokemonuniverse.application.datasync.DataSyncRecords;
import es.pokemonuniverse.application.datasync.DataSyncScheduler;
import es.pokemonuniverse.application.datasync.DataSyncService;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.NextScheduledSync;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.PokemonPaletteCount;
import es.pokemonuniverse.application.pokemon.PokemonCatalogService;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.context.BeanProvider;
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
 * estén portados) y el planificador con el horario de {@code pu.data-sync}. Existen aunque el data-sync esté apagado,
 * pero solo {@link DataSyncStartup} los pone en marcha y, apagado, las rutas de administración responden 503 como Node
 * sin servicio ({@code AdminDataSyncController}). El oyente
 * {@code onCompleted(TCGDEX) → tcgCards.refresh()} se registra al crear el servicio, antes de que nada pueda lanzar una
 * sincronización (incluida la inicial de TCG). Igual el de {@code onCompleted(POKEAPI)}: recarga catálogo, gritos y
 * artworks y los pasa a las salas ({@code rooms.replaceCatalog}, nueva {@code catalogVersion}); las partidas en curso
 * conservan los suyos. El coordinador se pide al dispararse (no se construye junto al servicio). Si la recarga falla,
 * el servicio registra el error y salas y {@code /api/pokemon} siguen con los catálogos anteriores.
 */
@Factory
@Requires(beans = DataSource.class)
public class DataSyncBeans {

  @Singleton
  @Bean(preDestroy = "stop")
  DataSyncService dataSyncService(DataSyncRecords records, List<DataSyncAdapter> adapters,
      @Nullable PokemonPaletteCount palettes, @Nullable CachedTcgCardCatalog tcgCards,
      @Nullable PokemonCatalogService pokemonCatalog, BeanProvider<RoomCoordinator> rooms, Clock clock,
      PuConfig.DataSync config) {
    var service = new DataSyncService(records, adapters, palettes, clock,
        () -> NextScheduledSync.after(Instant.ofEpochMilli(clock.now()), config.hour(), config.minute(), config.zone()),
        Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("data-sync-", 0).factory()));
    if (tcgCards != null) {
      service.onCompleted(source -> {
        if (source == DataSyncSource.TCGDEX) tcgCards.refresh();
      });
    }
    if (pokemonCatalog != null) {
      service.onCompleted(source -> {
        if (source == DataSyncSource.POKEAPI) rooms.get().replaceCatalog(pokemonCatalog.reloadGameCatalogs());
      });
    }
    return service;
  }

  @Singleton
  @Bean(preDestroy = "stop")
  DataSyncScheduler dataSyncScheduler(DataSyncService service, Clock clock, ScheduledSyncTimer timer,
      PuConfig.DataSync config) {
    return new DataSyncScheduler(() -> service.startAll(DataSyncMode.INCREMENTAL), clock, timer, config.hour(),
        config.minute(), config.zone());
  }
}

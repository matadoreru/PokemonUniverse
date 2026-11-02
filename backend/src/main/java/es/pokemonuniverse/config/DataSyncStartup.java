package es.pokemonuniverse.config;

import es.pokemonuniverse.application.datasync.DataSyncScheduler;
import es.pokemonuniverse.application.datasync.DataSyncService;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.StartupEvent;
import io.micronaut.runtime.event.annotation.EventListener;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;

/**
 * Arranque y apagado del data-sync ({@code index.ts}). Solo con {@code pu.data-sync.enabled}: marca como fallidas las
 * ejecuciones interrumpidas, espera la sincronización inicial de Pokémon (un error aborta el arranque), arma el
 * planificador y lanza en segundo plano la inicial de TCG. A diferencia de Node, {@code recoverInterrupted} también
 * depende del interruptor: con Node sincronizando la misma BD, Java marcaría como fallida una ejecución viva.
 * Al apagar: el planificador primero y después el servicio, que espera a las ejecuciones activas.
 */
@Singleton
@Requires(beans = DataSyncService.class)
public class DataSyncStartup {

  private final DataSyncService service;
  private final DataSyncScheduler scheduler;
  private final boolean enabled;

  @Inject
  public DataSyncStartup(DataSyncService service, DataSyncScheduler scheduler, PuConfig.DataSync config) {
    this(service, scheduler, config.enabled());
  }

  DataSyncStartup(DataSyncService service, DataSyncScheduler scheduler, boolean enabled) {
    this.service = service;
    this.scheduler = scheduler;
    this.enabled = enabled;
  }

  @EventListener
  void onStartup(StartupEvent event) {
    start();
  }

  void start() {
    if (!enabled) return;
    service.recoverInterrupted();
    service.ensureInitialPokemon();
    scheduler.start();
    service.startInitialTcgInBackground();
  }

  @PreDestroy
  void stop() {
    scheduler.stop();
    service.stop();
  }
}

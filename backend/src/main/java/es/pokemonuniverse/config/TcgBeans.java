package es.pokemonuniverse.config;

import es.pokemonuniverse.adapters.out.http.SyncHttpClient;
import es.pokemonuniverse.application.datasync.tcg.TcgCatalogStore;
import es.pokemonuniverse.application.datasync.tcg.TcgDataSync;
import es.pokemonuniverse.application.datasync.tcg.TcgDexUrls;
import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import es.pokemonuniverse.application.tcg.TcgCardRepository;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Requires;
import jakarta.inject.Singleton;
import javax.sql.DataSource;

/**
 * Catálogo TCG ({@code tcgCards} de {@code index.ts}) y adaptador {@code TCGDEX} del data-sync. El catálogo lo leen las
 * salas y {@code /api/tcg/*}; se carga al arrancar ({@link TcgCatalogStartup}) y tras cada sincronización TCGDEX
 * completada ({@link DataSyncBeans}). Construir el adaptador no hace ninguna petición.
 */
@Factory
@Requires(beans = DataSource.class)
public class TcgBeans {

  @Singleton
  CachedTcgCardCatalog tcgCardCatalog(TcgCardRepository repository) {
    return new CachedTcgCardCatalog(repository);
  }

  @Singleton
  TcgDataSync tcgDataSync(TcgCatalogStore store, SyncHttpClient http, Clock clock, PuConfig.DataSync config) {
    return new TcgDataSync(store, http, new TcgDexUrls(config.tcgdexBaseUrl()), Thread::sleep, clock);
  }
}

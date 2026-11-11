package es.pokemonuniverse.config;

import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.StartupEvent;
import io.micronaut.runtime.event.annotation.EventListener;
import jakarta.inject.Singleton;

/**
 * Carga el catálogo TCG al arrancar: solo con {@code pu.rooms.enabled=true} (lo leen las salas y {@code /api/tcg/*}),
 * con el data-sync encendido o apagado. Un fallo se propaga y aborta el arranque. Con las salas apagadas el catálogo
 * queda sin cargar y {@code /api/tcg/*} responde 500 «El catálogo TCG todavía no está disponible.» hasta que una
 * sincronización TCGDEX completada lo recargue. Con el data-sync apagado, este es el único momento en que el catálogo
 * se recarga.
 */
@Singleton
@Requires(beans = CachedTcgCardCatalog.class)
@Requires(property = "pu.rooms.enabled", value = "true")
public class TcgCatalogStartup {

  private final CachedTcgCardCatalog catalog;

  public TcgCatalogStartup(CachedTcgCardCatalog catalog) {
    this.catalog = catalog;
  }

  @EventListener
  void onStartup(StartupEvent event) {
    catalog.refresh();
  }
}

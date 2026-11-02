package es.pokemonuniverse.config;

import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.StartupEvent;
import io.micronaut.runtime.event.annotation.EventListener;
import jakarta.inject.Singleton;

/**
 * {@code await tcgCards.refresh()} del arranque de {@code index.ts}: solo lee la BD, así que corre siempre, con el
 * data-sync encendido o apagado. Un fallo se propaga como en Node (donde aborta el arranque). Mientras Node sea el dueño
 * de las sincronizaciones, este es el único momento en que el catálogo Java se recarga (pendiente de 2D).
 */
@Singleton
@Requires(beans = CachedTcgCardCatalog.class)
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

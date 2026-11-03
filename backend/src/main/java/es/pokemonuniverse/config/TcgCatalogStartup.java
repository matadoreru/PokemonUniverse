package es.pokemonuniverse.config;

import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.StartupEvent;
import io.micronaut.runtime.event.annotation.EventListener;
import jakarta.inject.Singleton;

/**
 * {@code await tcgCards.refresh()} del arranque de {@code index.ts}: solo con {@code pu.rooms.enabled=true} (lo leen
 * las salas Java y {@code /api/tcg/*}, que nginx no enruta a Java hasta 2D), con el data-sync encendido o apagado. Un
 * fallo se propaga como en Node (donde aborta el arranque). Con las salas apagadas el catálogo queda sin cargar y
 * {@code /api/tcg/*} responde 500 «El catálogo TCG todavía no está disponible.» hasta que una sincronización TCGDEX
 * completada por Java lo recargue. Mientras Node sea el dueño de las sincronizaciones, este es el único momento en que
 * el catálogo Java se recarga (pendiente de 2D).
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

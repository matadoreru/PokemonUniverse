package es.pokemonuniverse.config;

import es.pokemonuniverse.application.pokemon.PokemonCatalogService;
import es.pokemonuniverse.application.pokemon.PokemonSearchQuery;
import es.pokemonuniverse.application.pokemon.PokemonSpriteService;
import es.pokemonuniverse.application.pokemon.PokemonSpriteWarmup;
import io.micronaut.context.annotation.Property;
import io.micronaut.runtime.event.annotation.EventListener;
import io.micronaut.runtime.server.event.ServerStartupEvent;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.util.List;
import java.util.Optional;

/**
 * Lanza el precalentado de las miniaturas del buscador con {@code pu.sprites.warmup.enabled} (activo por defecto,
 * apagado en test). Escucha {@link ServerStartupEvent} y no {@code StartupEvent}: el servidor abre el puerto después
 * de la sincronización inicial de Pokémon ({@code DataSyncStartup}), así que el catálogo ya está cargado. Corre en un
 * hilo propio: ni el arranque ni {@code /health} lo esperan. En el orden del buscador, para que lo primero que se ve
 * sea lo primero que se descarga.
 */
@Singleton
public class PokemonSpriteWarmupStartup {

  private final PokemonSpriteWarmup warmup;
  private final boolean enabled;

  @Inject
  public PokemonSpriteWarmupStartup(PokemonCatalogService catalog, PokemonSpriteService sprites,
      @Property(name = "pu.sprites.warmup.enabled", defaultValue = "true") boolean enabled) {
    this(new PokemonSpriteWarmup(() -> catalog.selectorSearch(new PokemonSearchQuery(List.of(), false)), sprites,
        PokemonSpriteWarmup.CONCURRENCY), enabled);
  }

  PokemonSpriteWarmupStartup(PokemonSpriteWarmup warmup, boolean enabled) {
    this.warmup = warmup;
    this.enabled = enabled;
  }

  @EventListener
  void onServerStartup(ServerStartupEvent event) {
    start();
  }

  /** El hilo del precalentado, o vacío si está apagado. */
  Optional<Thread> start() {
    if (!enabled) return Optional.empty();
    return Optional.of(Thread.ofVirtual().name("pokemon-sprite-warmup").start(warmup::run));
  }

  @PreDestroy
  void stop() {
    warmup.stop();
  }
}

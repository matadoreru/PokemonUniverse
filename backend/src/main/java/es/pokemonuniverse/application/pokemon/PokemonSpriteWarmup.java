package es.pokemonuniverse.application.pokemon;

import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Precalentado de las miniaturas del buscador: tras el arranque descarga las de todos los Pokémon por defecto hacia la
 * caché de {@link PokemonSpriteService}, para que la primera búsqueda no espere al origen. Va por
 * {@link PokemonSpriteService#sprite} (la misma clave y la misma deduplicación que las peticiones reales) con pocas
 * descargas a la vez, así que deja casi todo el cupo de la caché a los jugadores. Nunca lanza: los fallos se cuentan.
 */
public class PokemonSpriteWarmup {

  /** Descargas simultáneas, de las {@link PokemonSpriteService#SPRITE_CACHE_CONCURRENCY} que admite la caché. */
  public static final int CONCURRENCY = 4;
  private static final Logger LOG = LoggerFactory.getLogger(PokemonSpriteWarmup.class);

  public record Result(int loaded, int failed) {}

  private final Supplier<List<Pokemon>> catalog;
  private final PokemonSpriteService sprites;
  private final int concurrency;
  private volatile boolean stopped;

  public PokemonSpriteWarmup(Supplier<List<Pokemon>> catalog, PokemonSpriteService sprites, int concurrency) {
    this.catalog = catalog;
    this.sprites = sprites;
    this.concurrency = concurrency;
  }

  /** Bloquea hasta terminar (o hasta {@link #stop}); quien arranca la aplicación lo lanza en su propio hilo. */
  public Result run() {
    List<Pokemon> pokemon;
    try {
      pokemon = catalog.get().stream().filter(Pokemon::isDefault).toList();
    } catch (RuntimeException e) {
      LOG.warn("Sprite warm-up skipped: catalog unavailable: {}", e.toString());
      return new Result(0, 0);
    }
    var started = System.nanoTime();
    var loaded = new AtomicInteger();
    var failed = new AtomicInteger();
    try (var executor = Executors.newFixedThreadPool(concurrency,
        Thread.ofVirtual().name("pokemon-sprite-warmup-", 0).factory())) {
      for (var p : pokemon) {
        executor.execute(() -> {
          if (stopped) return;
          try {
            sprites.sprite(p);
            loaded.incrementAndGet();
          } catch (RuntimeException e) {
            failed.incrementAndGet();
          }
        });
      }
    }
    var result = new Result(loaded.get(), failed.get());
    LOG.info("Sprite warm-up finished: {} loaded, {} failed in {} ms", result.loaded(), result.failed(),
        (System.nanoTime() - started) / 1_000_000);
    return result;
  }

  /** Las descargas en curso terminan; las que faltan ya no empiezan. */
  public void stop() {
    stopped = true;
  }
}

package es.pokemonuniverse.application.pokemon;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.GameAssetService;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.application.assets.ResourceCapacityException;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class PokemonSpriteServiceTest {

  private static final byte[] PNG = {1, 2, 3};

  /** Origen lento: cada descarga tarda 50 ms, como un sprite remoto en frío. */
  private static final class SlowLoader implements AssetSourceLoader {
    final AtomicInteger calls = new AtomicInteger();

    @Override
    public LoadedAsset fetch(String source) {
      calls.incrementAndGet();
      try {
        Thread.sleep(50);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException(e);
      }
      return new LoadedAsset(PNG, "image/png");
    }
  }

  private static Pokemon pokemon(String id) {
    return new Pokemon(id, 1, id, 1, true, "https://raw.githubusercontent.com/" + id + ".png", null, null, null, 1, 1,
        1, 1, 1, 1, 6, 1, 1, null, null, "NORMAL", "green", List.of(), Map.of(), List.of("grass"));
  }

  /** Lanza 120 sprites distintos a la vez y devuelve cuántas peticiones se rechazaron por capacidad. */
  private static int burst(PokemonSpriteService service) throws Exception {
    var start = new CountDownLatch(1);
    var rejected = new AtomicInteger();
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var futures = new ArrayList<Future<?>>();
      for (int i = 0; i < 120; i++) {
        var p = pokemon("burst-" + i);
        futures.add(executor.submit(() -> {
          start.await();
          try {
            assertArrayEquals(PNG, service.sprite(p).body());
          } catch (ResourceCapacityException e) {
            rejected.incrementAndGet();
          }
          return null;
        }));
      }
      start.countDown();
      for (var f : futures) f.get();
    }
    return rejected.get();
  }

  @Test
  void absorbsAFullSearchBurst() throws Exception {
    var loader = new SlowLoader();
    var service = new PokemonSpriteService(new GameAssetService(loader, PokemonSpriteService.cache()));
    assertEquals(0, burst(service));
    assertEquals(120, loader.calls.get());
    // Ya en caché: no se vuelve a descargar.
    service.sprite(pokemon("burst-7"));
    assertEquals(120, loader.calls.get());
  }

  /** La caché de las rondas (64 pendientes) no aguantaría la misma ráfaga: por eso el buscador tiene la suya. */
  @Test
  void theRoundCacheWouldRejectTheSameBurst() throws Exception {
    var service = new PokemonSpriteService(new GameAssetService(new SlowLoader(), GameAssetService.defaultCache()));
    assertTrue(burst(service) > 0);
  }

  @Test
  void cacheBoundsMatchThePlan() {
    assertEquals(16L * 1024 * 1024, PokemonSpriteService.SPRITE_CACHE_BYTES);
    assertEquals(4096, PokemonSpriteService.SPRITE_CACHE_ENTRIES);
    assertEquals(8, PokemonSpriteService.SPRITE_CACHE_CONCURRENCY);
    assertEquals(512, PokemonSpriteService.SPRITE_CACHE_PENDING);
  }
}

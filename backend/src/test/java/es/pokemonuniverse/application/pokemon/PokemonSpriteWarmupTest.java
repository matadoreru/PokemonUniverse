package es.pokemonuniverse.application.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.GameAssetService;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class PokemonSpriteWarmupTest {

  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G'};

  /** Origen falso que cuenta descargas y el máximo de descargas simultáneas. */
  private static final class CountingLoader implements AssetSourceLoader {
    final Set<String> fetched = ConcurrentHashMap.newKeySet();
    final AtomicInteger inFlight = new AtomicInteger();
    final AtomicInteger maxInFlight = new AtomicInteger();
    final boolean fail;

    CountingLoader(boolean fail) {
      this.fail = fail;
    }

    @Override
    public LoadedAsset fetch(String source) {
      var now = inFlight.incrementAndGet();
      maxInFlight.accumulateAndGet(now, Math::max);
      try {
        Thread.sleep(5);
        fetched.add(source);
        if (fail) throw new IllegalStateException("origen caído");
        return new LoadedAsset(PNG, "image/png");
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException(e);
      } finally {
        inFlight.decrementAndGet();
      }
    }
  }

  static Pokemon pokemon(String id, boolean isDefault) {
    return new Pokemon(id, 1, id, 1, isDefault, "https://raw.githubusercontent.com/" + id + ".png", null, null, null,
        1, 1, 1, 1, 1, 1, 6, 1, 1, null, null, "NORMAL", "green", List.of(), Map.of(), List.of("grass"));
  }

  private static List<Pokemon> catalog(int defaults, int forms) {
    var all = new ArrayList<Pokemon>();
    for (int i = 0; i < defaults; i++) all.add(pokemon("p" + i, true));
    for (int i = 0; i < forms; i++) all.add(pokemon("form" + i, false));
    return all;
  }

  private static PokemonSpriteService sprites(AssetSourceLoader loader) {
    return new PokemonSpriteService(new GameAssetService(loader, PokemonSpriteService.cache()));
  }

  @Test
  void downloadsEveryDefaultSpriteWithLowConcurrency() {
    var loader = new CountingLoader(false);
    var sprites = sprites(loader);
    var warmup = new PokemonSpriteWarmup(() -> catalog(200, 10), sprites, 4);

    var result = warmup.run();

    assertEquals(new PokemonSpriteWarmup.Result(200, 0), result);
    assertEquals(200, loader.fetched.size());
    assertTrue(loader.fetched.stream().noneMatch(s -> s.contains("form")), "las formas no se precargan");
    // La caché del buscador admite 16 descargas a la vez: el precalentado se queda en 4.
    assertTrue(loader.maxInFlight.get() <= 4, "máximo simultáneo " + loader.maxInFlight.get());
    assertTrue(loader.maxInFlight.get() > 1, "debería descargar en paralelo");
    // Ya en la caché del buscador: servirlas no vuelve a ir al origen.
    sprites.sprite(pokemon("p7", true));
    assertEquals(200, loader.fetched.size());
  }

  @Test
  void aFailingOriginIsCountedButNeverThrown() {
    var warmup = new PokemonSpriteWarmup(() -> catalog(20, 0), sprites(new CountingLoader(true)), 4);

    assertEquals(new PokemonSpriteWarmup.Result(0, 20), warmup.run());
  }

  @Test
  void aFailingCatalogIsNeverThrown() {
    var warmup = new PokemonSpriteWarmup(() -> {
      throw new IllegalStateException("sin BD");
    }, sprites(new CountingLoader(false)), 4);

    assertEquals(new PokemonSpriteWarmup.Result(0, 0), warmup.run());
  }

  @Test
  void stopSkipsTheRemainingSprites() {
    var loader = new CountingLoader(false);
    var holder = new PokemonSpriteWarmup[1];
    var calls = new AtomicInteger();
    var stopping = new AssetSourceLoader() {
      @Override
      public LoadedAsset fetch(String source) {
        if (calls.incrementAndGet() == 3) holder[0].stop();
        return loader.fetch(source);
      }
    };
    holder[0] = new PokemonSpriteWarmup(() -> catalog(500, 0), sprites(stopping), 1);

    var result = holder[0].run();

    assertTrue(result.loaded() < 10, "tras stop() no se descargan más: " + result);
  }
}

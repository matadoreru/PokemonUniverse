package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.assets.AssetSourceLoader;
import es.pokemonuniverse.application.assets.GameAssetService;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.application.pokemon.PokemonSpriteService;
import es.pokemonuniverse.application.pokemon.PokemonSpriteWarmup;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class PokemonSpriteWarmupStartupTest {

  private static final class GatedLoader implements AssetSourceLoader {
    final CountDownLatch gate = new CountDownLatch(1);
    final AtomicInteger calls = new AtomicInteger();

    @Override
    public LoadedAsset fetch(String source) {
      calls.incrementAndGet();
      try {
        gate.await(5, TimeUnit.SECONDS);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
      return new LoadedAsset(new byte[] {1}, "image/png");
    }
  }

  private static PokemonSpriteWarmup warmup(AssetSourceLoader loader) {
    var pokemon = new Pokemon("bulbasaur", 1, "Bulbasaur", 1, true, "https://raw.githubusercontent.com/1.png", null,
        null, null, 1, 1, 1, 1, 1, 1, 6, 1, 1, null, null, "NORMAL", "green", List.of(), Map.of(), List.of("grass"));
    var sprites = new PokemonSpriteService(new GameAssetService(loader, PokemonSpriteService.cache()));
    return new PokemonSpriteWarmup(() -> List.of(pokemon), sprites, 4);
  }

  @Test
  void disabledDoesNotDownloadAnything() {
    var loader = new GatedLoader();
    var startup = new PokemonSpriteWarmupStartup(warmup(loader), false);

    assertTrue(startup.start().isEmpty());
    assertEquals(0, loader.calls.get());
  }

  @Test
  void enabledRunsInTheBackgroundWithoutBlockingTheStartup() throws Exception {
    var loader = new GatedLoader();
    var startup = new PokemonSpriteWarmupStartup(warmup(loader), true);

    // El origen está retenido: si el arranque esperase al precalentado, start() no volvería.
    var thread = startup.start().orElseThrow();
    assertTrue(thread.isAlive());

    loader.gate.countDown();
    thread.join(5_000);
    assertEquals(1, loader.calls.get());
  }

  @Test
  void theTestEnvironmentDisablesTheWarmup() {
    try (var context = io.micronaut.context.ApplicationContext.builder().environments("test").build()) {
      context.getEnvironment().start();
      assertEquals(false, context.getEnvironment().getProperty("pu.sprites.warmup.enabled", Boolean.class)
          .orElseThrow());
      assertEquals("", context.getEnvironment().getProperty("pu.sprites.cache-dir", String.class).orElse(""));
    }
  }
}

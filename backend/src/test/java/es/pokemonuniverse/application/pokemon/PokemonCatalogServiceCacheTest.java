package es.pokemonuniverse.application.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;

/**
 * Caché de {@link PokemonCatalogService#catalog()} ({@link CatalogSnapshotCache}) sin base de datos: un cargador que
 * cuenta sus ejecuciones y un reloj manual.
 */
class PokemonCatalogServiceCacheTest {

  private static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");
  private static final int READERS = 16;

  private final AtomicReference<Instant> clock = new AtomicReference<>(T0);
  private final AtomicInteger loads = new AtomicInteger();

  @Test
  void servesTheSameSnapshotUntilTheTtlExpires() {
    var cache = new CatalogSnapshotCache<>(() -> new Object[] {loads.incrementAndGet()}, PokemonCatalogService.TTL,
        clock::get);
    var first = cache.get();
    clock.set(T0.plus(PokemonCatalogService.TTL));
    assertSame(first, cache.get());
    clock.set(T0.plus(PokemonCatalogService.TTL).plusMillis(1));
    var second = cache.get();
    assertTrue(first != second);
    assertEquals(2, loads.get());
  }

  @Test
  void concurrentReadersAfterExpiryShareASingleLoad() throws Exception {
    var loaderEntered = new CountDownLatch(1);
    var releaseLoader = new CountDownLatch(1);
    var cache = new CatalogSnapshotCache<>(() -> {
      if (loads.incrementAndGet() > 1) {
        loaderEntered.countDown();
        await(releaseLoader);
      }
      return new Object();
    }, PokemonCatalogService.TTL, clock::get);
    var stale = cache.get();
    clock.set(T0.plus(PokemonCatalogService.TTL).plusSeconds(1));

    var results = new ArrayList<AtomicReference<Object>>();
    var threads = new ArrayList<Thread>();
    for (var i = 0; i < READERS; i++) {
      var result = new AtomicReference<Object>();
      results.add(result);
      threads.add(Thread.ofPlatform().start(() -> result.set(cache.get())));
    }
    assertTrue(loaderEntered.await(5, TimeUnit.SECONDS), "ningún hilo empezó la recarga");
    // Todos los demás lectores están esperando el cerrojo de recarga mientras la carga sigue en vuelo.
    waitUntil(() -> threads.stream().filter(t -> t.getState() == Thread.State.BLOCKED).count() == READERS - 1);
    releaseLoader.countDown();
    for (var thread : threads) thread.join(5_000);

    assertEquals(2, loads.get(), "la recarga al caducar debe ejecutarse una sola vez");
    var fresh = results.get(0).get();
    assertTrue(fresh != stale);
    for (var result : results) assertSame(fresh, result.get());
  }

  @Test
  void invalidateForcesAReloadAndAFailedLoadIsRetried() {
    var fail = new AtomicBoolean();
    var cache = new CatalogSnapshotCache<>(() -> {
      loads.incrementAndGet();
      if (fail.get()) throw new IllegalStateException("bd caída");
      return new Object();
    }, PokemonCatalogService.TTL, clock::get);
    var first = cache.get();
    cache.invalidate();
    fail.set(true);
    assertThrows(IllegalStateException.class, cache::get);
    fail.set(false);
    var second = cache.get();
    assertTrue(first != second);
    assertSame(second, cache.get());
    assertEquals(3, loads.get());
  }

  @Test
  void replaceInstallsTheValueWithoutLoadingAndRestartsTheTtl() {
    var cache = new CatalogSnapshotCache<>(() -> new Object[] {loads.incrementAndGet()}, PokemonCatalogService.TTL,
        clock::get);
    cache.get();
    clock.set(T0.plusSeconds(60));
    var replacement = new Object[] {"nuevo"};
    cache.replace(replacement);
    assertSame(replacement, cache.get());
    clock.set(T0.plusSeconds(60).plus(PokemonCatalogService.TTL));
    assertSame(replacement, cache.get());
    assertEquals(1, loads.get());
  }

  /** Una recarga por caducidad que empezó antes de {@code replace} no pisa el catálogo recién instalado. */
  @Test
  void aLoadInFlightDoesNotOverwriteAReplacement() throws Exception {
    var loaderEntered = new CountDownLatch(1);
    var releaseLoader = new CountDownLatch(1);
    var cache = new CatalogSnapshotCache<Object>(() -> {
      if (loads.incrementAndGet() > 1) {
        loaderEntered.countDown();
        await(releaseLoader);
      }
      return new Object();
    }, PokemonCatalogService.TTL, clock::get);
    cache.get();
    clock.set(T0.plus(PokemonCatalogService.TTL).plusSeconds(1));
    var reader = Thread.ofPlatform().start(cache::get);
    assertTrue(loaderEntered.await(5, TimeUnit.SECONDS), "la recarga no empezó");
    var replacement = new Object();
    var writer = Thread.ofPlatform().start(() -> cache.replace(replacement));
    releaseLoader.countDown();
    reader.join(5_000);
    writer.join(5_000);
    assertSame(replacement, cache.get());
    assertEquals(2, loads.get());
  }

  private static void await(CountDownLatch latch) {
    try {
      if (!latch.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("el test no liberó la carga");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }

  private static void waitUntil(BooleanSupplier condition) throws InterruptedException {
    var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
    while (!condition.getAsBoolean()) {
      if (System.nanoTime() > deadline) throw new AssertionError("los lectores no llegaron a esperar la recarga");
      Thread.sleep(5);
    }
  }
}

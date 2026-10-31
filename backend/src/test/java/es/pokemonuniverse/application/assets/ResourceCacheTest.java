package es.pokemonuniverse.application.assets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class ResourceCacheTest {

  private static ResourceCache<String> cache(long bytes, int entries, int concurrency, int pending) {
    return new ResourceCache<>(bytes, entries, concurrency, pending, String::length);
  }

  @Test
  void concurrentLoadsOfSameKeyRunLoaderOnce() throws Exception {
    var cache = cache(1024, 16, 8, 64);
    var calls = new AtomicInteger();
    var release = new CountDownLatch(1);
    var started = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var first = executor.submit(() -> cache.load("k", () -> {
        calls.incrementAndGet();
        started.countDown();
        await(release);
        return "value";
      }));
      assertEquals(true, started.await(5, TimeUnit.SECONDS));
      var second = executor.submit(() -> cache.load("k", () -> {
        calls.incrementAndGet();
        return "other";
      }));
      release.countDown();
      assertEquals("value", first.get(5, TimeUnit.SECONDS));
      assertEquals("value", second.get(5, TimeUnit.SECONDS));
    }
    assertEquals(1, calls.get());
    assertEquals("value", cache.load("k", () -> "fresh"));
  }

  @Test
  void rejectsWhenPendingLimitIsReached() throws Exception {
    var cache = cache(1 << 20, 256, 8, 64);
    var release = new CountDownLatch(1);
    var entered = new AtomicInteger();
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var futures = new ArrayList<Future<String>>();
      for (int i = 0; i < 64; i++) {
        var key = "k" + i;
        futures.add(executor.submit(() -> cache.load(key, () -> {
          entered.incrementAndGet();
          await(release);
          return key;
        })));
      }
      long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
      while (cache.pendingCount() < 64 && System.nanoTime() < deadline) Thread.onSpinWait();
      assertEquals(64, cache.pendingCount());
      // Concurrencia 8: solo 8 cargadores ejecutan; los demás esperan turno pero cuentan como pendientes.
      while (entered.get() < 8 && System.nanoTime() < deadline) Thread.onSpinWait();
      assertEquals(8, entered.get());
      var error = assertThrows(ResourceCapacityException.class, () -> cache.load("k64", () -> "x"));
      assertEquals("El servidor está procesando demasiados recursos. Reintenta en unos segundos.", error.getMessage());
      release.countDown();
      for (var future : futures) future.get(5, TimeUnit.SECONDS);
    }
    assertEquals(0, cache.pendingCount());
    assertEquals("x", cache.load("k64", () -> "x"));
  }

  @Test
  void valueLargerThanBudgetIsReturnedButNotCached() {
    var cache = cache(4, 16, 8, 64);
    var calls = new AtomicInteger();
    assertEquals("too-big", cache.load("k", () -> { calls.incrementAndGet(); return "too-big"; }));
    assertEquals("too-big", cache.load("k", () -> { calls.incrementAndGet(); return "too-big"; }));
    assertEquals(2, calls.get());
  }

  @Test
  void evictsLeastRecentlyUsedByEntriesAndBytes() {
    var cache = cache(6, 2, 8, 64);
    cache.load("a", () -> "aa");
    cache.load("b", () -> "bb");
    cache.load("a", () -> "new"); // toca "a": "b" pasa a ser la más antigua
    cache.load("c", () -> "cc");
    assertEquals("aa", cache.load("a", () -> "reloaded"));
    assertEquals("reloaded-b", cache.load("b", () -> "reloaded-b"));
    // Presupuesto en bytes: "reloaded-b" (10) no cabe en 6 y se devuelve sin cachear; "a" y "c" siguen.
    assertEquals("aa", cache.load("a", () -> "x"));
    assertEquals("cc", cache.load("c", () -> "x"));
    var bytes = cache(5, 10, 8, 64);
    bytes.load("a", () -> "aaa");
    bytes.load("b", () -> "bbb"); // 6 > 5: expulsa "a"
    assertEquals("again", bytes.load("a", () -> "again"));
  }

  @Test
  void loaderFailureIsPropagatedAndNotCached() {
    var cache = cache(1024, 16, 8, 64);
    var error = assertThrows(IllegalStateException.class,
        () -> cache.load("k", () -> { throw new IllegalStateException("boom"); }));
    assertEquals("boom", error.getMessage());
    assertEquals(0, cache.pendingCount());
    assertEquals("ok", cache.load("k", () -> "ok"));
  }

  private static void await(CountDownLatch latch) {
    try {
      latch.await(5, TimeUnit.SECONDS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }
}

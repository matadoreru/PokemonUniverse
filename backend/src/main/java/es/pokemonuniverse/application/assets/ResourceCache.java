package es.pokemonuniverse.application.assets;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Semaphore;
import java.util.function.Supplier;
import java.util.function.ToLongFunction;

/**
 * {@code ResourceCache} de Node: LRU por clave acotada en bytes y entradas, cargas concurrentes limitadas, tope de
 * claves pendientes y deduplicación en vuelo. Un valor mayor que el presupuesto se devuelve sin cachear. Es bloqueante:
 * el hilo que crea la carga ejecuta el cargador (tras su turno de concurrencia) y los demás esperan su resultado.
 */
public final class ResourceCache<T> {

  private record Completed<T>(T value, long bytes) {}

  private final long maxBytes;
  private final int maxEntries;
  private final int maxPending;
  private final ToLongFunction<T> size;
  private final Semaphore slots;
  /** Orden de acceso: el primero es el menos usado recientemente. */
  private final LinkedHashMap<String, Completed<T>> completed = new LinkedHashMap<>(16, 0.75f, true);
  private final Map<String, CompletableFuture<T>> pending = new HashMap<>();
  private long bytes;

  public ResourceCache(long maxBytes, int maxEntries, int concurrency, int maxPending, ToLongFunction<T> size) {
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
    this.maxPending = maxPending;
    this.size = size;
    this.slots = new Semaphore(concurrency, true);
  }

  public T load(String key, Supplier<T> loader) {
    CompletableFuture<T> task;
    CompletableFuture<T> existing;
    synchronized (this) {
      var cached = completed.get(key);
      if (cached != null) return cached.value();
      existing = pending.get(key);
      if (existing == null) {
        if (pending.size() >= maxPending) throw new ResourceCapacityException();
        task = new CompletableFuture<>();
        pending.put(key, task);
      } else {
        task = null;
      }
    }
    if (existing != null) return await(existing);
    try {
      T value = run(loader);
      store(key, value);
      task.complete(value);
      return value;
    } catch (RuntimeException | Error e) {
      task.completeExceptionally(e);
      throw e;
    } finally {
      synchronized (this) {
        pending.remove(key);
      }
    }
  }

  /** Tope de claves en vuelo. */
  int maxPending() {
    return maxPending;
  }

  /** Claves en vuelo (ejecutando o esperando turno). */
  synchronized int pendingCount() {
    return pending.size();
  }

  private T run(Supplier<T> loader) {
    try {
      slots.acquire();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Carga de recurso interrumpida", e);
    }
    try {
      return loader.get();
    } finally {
      slots.release();
    }
  }

  private synchronized void store(String key, T value) {
    long valueBytes = size.applyAsLong(value);
    if (valueBytes > maxBytes) return;
    var previous = completed.put(key, new Completed<>(value, valueBytes));
    if (previous != null) bytes -= previous.bytes();
    bytes += valueBytes;
    var iterator = completed.entrySet().iterator();
    while ((bytes > maxBytes || completed.size() > maxEntries) && iterator.hasNext()) {
      bytes -= iterator.next().getValue().bytes();
      iterator.remove();
    }
  }

  private static <T> T await(CompletableFuture<T> task) {
    try {
      return task.get();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Carga de recurso interrumpida", e);
    } catch (ExecutionException e) {
      if (e.getCause() instanceof RuntimeException runtime) throw runtime;
      if (e.getCause() instanceof Error error) throw error;
      throw new IllegalStateException(e.getCause());
    }
  }
}

package es.pokemonuniverse.application.rooms;

import java.time.Duration;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** {@code lifecycle/pending-tasks.ts}: sigue el trabajo aceptado hasta el cierre; los fallos siguen siendo visibles. */
public final class PendingTasks {

  private final Set<CompletableFuture<?>> pending = ConcurrentHashMap.newKeySet();

  public <T> CompletableFuture<T> track(CompletableFuture<T> task) {
    pending.add(task);
    task.whenComplete((value, error) -> pending.remove(task));
    return task;
  }

  /** Espera hasta que no quede trabajo (incluido el que se añada mientras tanto). */
  public void flush() {
    while (!pending.isEmpty()) {
      try {
        CompletableFuture.allOf(pending.toArray(CompletableFuture[]::new)).exceptionally(error -> null).join();
      } catch (RuntimeException ignored) {
        // allSettled: los fallos ya los registra quien creó la tarea.
      }
    }
  }

  /** Como {@link #flush()}, pero se rinde tras {@code timeout}; devuelve si quedó vacío. */
  public boolean flush(Duration timeout) {
    long deadline = System.nanoTime() + timeout.toNanos();
    while (!pending.isEmpty()) {
      long remaining = deadline - System.nanoTime();
      if (remaining <= 0) return false;
      try {
        CompletableFuture.allOf(pending.toArray(CompletableFuture[]::new)).exceptionally(error -> null)
            .get(remaining, TimeUnit.NANOSECONDS);
      } catch (TimeoutException e) {
        return false;
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        return false;
      } catch (Exception ignored) {
        // allSettled
      }
    }
    return true;
  }

  public int size() {
    return pending.size();
  }
}

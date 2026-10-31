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
    while (true) {
      var snapshot = pending.toArray(CompletableFuture[]::new);
      if (snapshot.length == 0) return;
      try {
        CompletableFuture.allOf(snapshot).exceptionally(error -> null).join();
      } catch (RuntimeException ignored) {
        // allSettled: los fallos ya los registra quien creó la tarea.
      }
      settle(snapshot);
    }
  }

  /** Como {@link #flush()}, pero se rinde tras {@code timeout}; devuelve si quedó vacío. */
  public boolean flush(Duration timeout) {
    long deadline = System.nanoTime() + timeout.toNanos();
    while (true) {
      var snapshot = pending.toArray(CompletableFuture[]::new);
      if (snapshot.length == 0) return true;
      long remaining = deadline - System.nanoTime();
      if (remaining <= 0) return false;
      try {
        CompletableFuture.allOf(snapshot).exceptionally(error -> null).get(remaining, TimeUnit.NANOSECONDS);
      } catch (TimeoutException e) {
        return false;
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        return false;
      } catch (Exception ignored) {
        // allSettled
      }
      settle(snapshot);
    }
  }

  /**
   * Retira ya las tareas esperadas: el {@code whenComplete} que las quita puede ejecutarse después de que
   * {@code allOf} termine, y sin esto el bucle volvería a girar sobre tareas ya completadas.
   */
  private void settle(CompletableFuture<?>[] snapshot) {
    for (var task : snapshot) if (task.isDone()) pending.remove(task);
  }

  public int size() {
    return pending.size();
  }
}

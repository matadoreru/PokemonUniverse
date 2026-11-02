package es.pokemonuniverse.config;

import es.pokemonuniverse.application.datasync.SyncTimer;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Singleton;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Temporizador del planificador del data-sync sobre un hilo virtual (no retiene el apagado, como {@code unref()}). */
@Singleton
public class ScheduledSyncTimer implements SyncTimer {

  private final ScheduledExecutorService executor =
      Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("data-sync-timer").factory());

  @Override
  public Runnable schedule(Runnable task, long delayMs) {
    var future = executor.schedule(task, delayMs, TimeUnit.MILLISECONDS);
    return () -> future.cancel(false);
  }

  @PreDestroy
  void close() {
    executor.shutdownNow();
  }
}

package es.pokemonuniverse.application.rooms;

import jakarta.annotation.PreDestroy;
import jakarta.inject.Singleton;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Planificador de producción: un único hilo virtual dispara los plazos y cada callback corre en su propio hilo
 * virtual, de modo que esperar el lock de una sala nunca retrasa los temporizadores de otra.
 */
@Singleton
public class ExecutorRoomSchedulers implements RoomSchedulers {

  private final ScheduledExecutorService executor =
      Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("room-timers").factory());

  @Override
  public Runnable schedule(long delayMs, Runnable task) {
    var future = executor.schedule(() -> Thread.ofVirtual().name("room-timer-task").start(task),
        Math.max(0, delayMs), TimeUnit.MILLISECONDS);
    return () -> future.cancel(false);
  }

  @PreDestroy
  void shutdown() {
    executor.shutdownNow();
  }
}

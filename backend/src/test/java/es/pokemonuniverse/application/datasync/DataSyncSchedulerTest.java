package es.pokemonuniverse.application.datasync;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

/** Planificador con reloj y temporizador falsos: nada duerme. */
class DataSyncSchedulerTest {

  private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");

  private static final class FakeTimer implements SyncTimer {
    final List<Long> delays = new ArrayList<>();
    final List<Runnable> tasks = new ArrayList<>();
    int cancelled;

    @Override
    public Runnable schedule(Runnable task, long delayMs) {
      delays.add(delayMs);
      tasks.add(task);
      return () -> cancelled++;
    }

    void fireLast() {
      tasks.getLast().run();
    }
  }

  private final AtomicLong now = new AtomicLong(Instant.parse("2026-01-15T04:00:00Z").toEpochMilli());
  private final FakeTimer timer = new FakeTimer();
  private final AtomicInteger syncs = new AtomicInteger();
  private CompletableFuture<?> nextResult = CompletableFuture.completedFuture(null);

  private DataSyncScheduler scheduler() {
    return new DataSyncScheduler(() -> {
      syncs.incrementAndGet();
      return nextResult;
    }, now::get, timer, 6, 0, MADRID);
  }

  @Test
  void startArmsASingleTimerUntilTheNextScheduledTime() {
    var scheduler = scheduler();
    scheduler.start();
    scheduler.start();
    assertTrue(scheduler.running());
    // 05:00 Madrid → 06:00 Madrid: una hora.
    assertEquals(List.of(3_600_000L), timer.delays);
    assertEquals(Instant.parse("2026-01-15T05:00:00Z"), scheduler.next());
  }

  @Test
  void theDelayHasAFloorOfOneSecond() {
    now.set(Instant.parse("2026-01-15T04:59:59.700Z").toEpochMilli());
    scheduler().start();
    assertEquals(List.of(1_000L), timer.delays);
  }

  @Test
  void firingMoreThanOneSecondEarlyReArmsWithoutSyncing() {
    var scheduler = scheduler();
    scheduler.start();
    now.addAndGet(3_600_000L - 5_000L);
    timer.fireLast();
    assertEquals(0, syncs.get());
    assertEquals(List.of(3_600_000L, 5_000L), timer.delays);
  }

  @Test
  void firingOnTimeStartsAnIncrementalSyncAndReArmsForTheNextDay() {
    var scheduler = scheduler();
    scheduler.start();
    now.addAndGet(3_600_000L + 200L);
    timer.fireLast();
    assertEquals(1, syncs.get());
    assertEquals(2, timer.delays.size());
    assertEquals(86_400_000L - 200L, timer.delays.getLast());
  }

  /** Hasta 1 s de adelanto cuenta como a tiempo. */
  @Test
  void firingLessThanOneSecondEarlyStillSyncs() {
    var scheduler = scheduler();
    scheduler.start();
    now.addAndGet(3_600_000L - 900L);
    timer.fireLast();
    assertEquals(1, syncs.get());
  }

  @Test
  void aFailedSyncIsLoggedAndTheTimerIsReArmedWhenItSettles() {
    var pending = new CompletableFuture<Void>();
    nextResult = pending;
    var scheduler = scheduler();
    scheduler.start();
    now.addAndGet(3_600_000L);
    timer.fireLast();
    assertEquals(1, timer.delays.size());
    pending.completeExceptionally(new IllegalStateException("Ya hay una sincronización activa"));
    assertEquals(2, timer.delays.size());
  }

  @Test
  void aSynchronousFailureAlsoReArms() {
    var scheduler = new DataSyncScheduler(() -> {
      throw new IllegalStateException("El servidor se está cerrando");
    }, now::get, timer, 6, 0, MADRID);
    scheduler.start();
    now.addAndGet(3_600_000L);
    timer.fireLast();
    assertEquals(2, timer.delays.size());
  }

  @Test
  void stopCancelsTheTimerAndASettlingSyncDoesNotReArm() {
    var pending = new CompletableFuture<Void>();
    nextResult = pending;
    var scheduler = scheduler();
    scheduler.start();
    now.addAndGet(3_600_000L);
    timer.fireLast();
    scheduler.stop();
    assertFalse(scheduler.running());
    pending.complete(null);
    assertEquals(1, timer.delays.size());
    assertEquals(1, timer.cancelled);
  }
}

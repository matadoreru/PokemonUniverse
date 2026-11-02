package es.pokemonuniverse.application.datasync;

import es.pokemonuniverse.application.time.Clock;
import io.micronaut.core.annotation.Nullable;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code DataSyncScheduler} de {@code scheduler.ts}: un único temporizador hasta la siguiente {@code hh:mm} de la zona
 * (espera de {@code min(next − now, 2 147 000 000)} ms con un mínimo de 1 s). Si dispara con más de 1 s de adelanto se
 * rearma; si no, lanza {@code startAll(INCREMENTAL)}, registra el fallo y se rearma cuando termina. {@link #stop()}
 * cancela el temporizador sin interrumpir una sincronización en curso.
 */
public class DataSyncScheduler {

  private static final Logger LOG = LoggerFactory.getLogger(DataSyncScheduler.class);
  private static final long MAX_DELAY_MS = 2_147_000_000L;
  private static final long MIN_DELAY_MS = 1_000L;

  private final Supplier<CompletableFuture<?>> startIncremental;
  private final Clock clock;
  private final SyncTimer timer;
  private final int hour;
  private final int minute;
  private final ZoneId zone;
  private boolean running;
  private @Nullable Runnable cancel;

  public DataSyncScheduler(Supplier<CompletableFuture<?>> startIncremental, Clock clock, SyncTimer timer, int hour,
      int minute, ZoneId zone) {
    this.startIncremental = startIncremental;
    this.clock = clock;
    this.timer = timer;
    this.hour = hour;
    this.minute = minute;
    this.zone = zone;
  }

  /** La siguiente sincronización programada a partir de ahora ({@code nextSyncAt} del resumen). */
  public Instant next() {
    return NextScheduledSync.after(Instant.ofEpochMilli(clock.now()), hour, minute, zone);
  }

  public synchronized void start() {
    if (running) return;
    running = true;
    arm();
  }

  public synchronized void stop() {
    running = false;
    if (cancel != null) cancel.run();
    cancel = null;
  }

  public synchronized boolean running() {
    return running;
  }

  private synchronized void arm() {
    if (!running) return;
    var next = next();
    var delay = Math.min(next.toEpochMilli() - clock.now(), MAX_DELAY_MS);
    cancel = timer.schedule(() -> fire(next), Math.max(MIN_DELAY_MS, delay));
    LOG.info("[DataSync] next synchronization at {} ({})", next, zone);
  }

  private void fire(Instant next) {
    synchronized (this) {
      if (!running) return;
      if (clock.now() + MIN_DELAY_MS < next.toEpochMilli()) {
        arm();
        return;
      }
    }
    CompletableFuture<?> sync;
    try {
      sync = startIncremental.get();
    } catch (RuntimeException e) {
      sync = CompletableFuture.failedFuture(e);
    }
    sync.whenComplete((ignored, error) -> {
      if (error != null) LOG.error("[DataSync] scheduled synchronization failed:", error);
      arm();
    });
  }
}

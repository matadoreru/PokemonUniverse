package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.application.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Reloj y temporizadores falsos ({@code vi.useFakeTimers()}): {@link #advance(long)} ejecuta en orden los callbacks
 * vencidos en el hilo que avanza, igual que {@code vi.advanceTimersByTime}.
 */
final class ManualTime implements Clock, RoomSchedulers {

  static final class Entry {
    final long dueAt;
    final long sequence;
    final Runnable task;
    boolean cancelled;
    boolean ran;

    Entry(long dueAt, long sequence, Runnable task) {
      this.dueAt = dueAt;
      this.sequence = sequence;
      this.task = task;
    }
  }

  private long now;
  private long sequence;
  private final List<Entry> entries = new ArrayList<>();

  ManualTime(long start) {
    this.now = start;
  }

  @Override
  public synchronized long now() {
    return now;
  }

  synchronized void set(long value) {
    now = value;
  }

  @Override
  public synchronized Runnable schedule(long delayMs, Runnable task) {
    var entry = new Entry(now + Math.max(0, delayMs), sequence++, task);
    entries.add(entry);
    return () -> {
      synchronized (ManualTime.this) {
        entry.cancelled = true;
      }
    };
  }

  /** Último callback programado, aunque luego se cancele (para simular uno ya encolado). */
  synchronized Runnable lastScheduledTask() {
    return entries.getLast().task;
  }

  synchronized int activeTimers() {
    return (int) entries.stream().filter(entry -> !entry.cancelled && !entry.ran).count();
  }

  void advance(long ms) {
    long target;
    synchronized (this) {
      target = now + ms;
    }
    while (true) {
      Entry next;
      synchronized (this) {
        next = entries.stream().filter(entry -> !entry.cancelled && !entry.ran && entry.dueAt <= target)
            .min(Comparator.comparingLong((Entry entry) -> entry.dueAt).thenComparingLong(entry -> entry.sequence))
            .orElse(null);
        if (next == null) {
          now = Math.max(now, target);
          return;
        }
        next.ran = true;
        now = Math.max(now, next.dueAt);
      }
      next.task.run();
    }
  }
}

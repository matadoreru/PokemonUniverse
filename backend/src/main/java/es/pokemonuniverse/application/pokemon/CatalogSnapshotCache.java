package es.pokemonuniverse.application.pokemon;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * Instantánea con caducidad y recarga de un solo vuelo. La lectura en caliente es una lectura {@code volatile} sin
 * cerrojo; solo cuando la instantánea falta o ha caducado se entra en un bloque {@code synchronized}, donde se vuelve
 * a comprobar antes de cargar. Así, N peticiones concurrentes al caducar ejecutan una única carga y las demás esperan
 * y reutilizan su resultado. Si la carga falla, la excepción llega a quien la lanzó y la siguiente lectura reintenta.
 */
final class CatalogSnapshotCache<T> {

  private record Entry<T>(T value, Instant loadedAt) {}

  private final Supplier<T> loader;
  private final Duration ttl;
  private final Supplier<Instant> now;
  private final Object refill = new Object();
  /** Se incrementa en cada {@link #invalidate()}: una carga empezada antes no se guarda como vigente. */
  private final AtomicLong generation = new AtomicLong();
  private volatile Entry<T> current;

  CatalogSnapshotCache(Supplier<T> loader, Duration ttl, Supplier<Instant> now) {
    this.loader = Objects.requireNonNull(loader, "loader");
    this.ttl = Objects.requireNonNull(ttl, "ttl");
    this.now = Objects.requireNonNull(now, "now");
  }

  T get() {
    var entry = current;
    if (isFresh(entry)) return entry.value();
    synchronized (refill) {
      entry = current;
      if (isFresh(entry)) return entry.value();
      var startedAt = generation.get();
      var loaded = new Entry<>(loader.get(), now.get());
      if (generation.get() == startedAt) current = loaded;
      return loaded.value();
    }
  }

  /** Descarta la instantánea; la siguiente lectura recarga. */
  void invalidate() {
    generation.incrementAndGet();
    current = null;
  }

  private boolean isFresh(Entry<T> entry) {
    return entry != null && !entry.loadedAt().plus(ttl).isBefore(now.get());
  }
}

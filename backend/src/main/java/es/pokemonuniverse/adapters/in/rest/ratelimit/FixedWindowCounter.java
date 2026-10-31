package es.pokemonuniverse.adapters.in.rest.ratelimit;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/** Contador de ventana fija por clave, con limpieza perezosa de las ventanas vencidas. */
final class FixedWindowCounter {

  private static final int CLEANUP_EVERY = 1024;

  /** Resultado de contar una petición: total en la ventana y segundos hasta su reinicio. */
  record Hit(int count, long resetSeconds) {}

  private record Window(long startEpochSeconds, int count) {}

  private final long windowSeconds;
  private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
  private final AtomicInteger hits = new AtomicInteger();

  FixedWindowCounter(long windowSeconds) {
    this.windowSeconds = windowSeconds;
  }

  Hit hit(String key, long nowEpochSeconds) {
    if (hits.incrementAndGet() % CLEANUP_EVERY == 0) {
      windows.values().removeIf(w -> w.startEpochSeconds() + windowSeconds <= nowEpochSeconds);
    }
    Window w = windows.compute(key, (k, old) -> old == null || old.startEpochSeconds() + windowSeconds <= nowEpochSeconds
        ? new Window(nowEpochSeconds, 1)
        : new Window(old.startEpochSeconds(), old.count() + 1));
    return new Hit(w.count(), w.startEpochSeconds() + windowSeconds - nowEpochSeconds);
  }
}

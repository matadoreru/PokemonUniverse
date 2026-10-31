package es.pokemonuniverse.adapters.in.ws;

import java.util.function.LongSupplier;

/**
 * Límite de eventos de una conexión ({@code socket.use} de {@code index.ts}): 50 por ventana fija de 10 s. Los eventos
 * de cursor no pasan por aquí. Un evento rechazado no cuenta. Lo usa solo el hilo serie de su conexión.
 */
final class WsRateLimiter {

  static final int MAX_EVENTS = 50;
  static final long WINDOW_MS = 10_000;

  private final LongSupplier clock;
  private long windowStartedAt;
  private int count;

  WsRateLimiter(LongSupplier clock) {
    this.clock = clock;
  }

  /** {@code true} si el evento entra en la ventana actual (y lo cuenta); {@code false} si supera el límite. */
  synchronized boolean tryAcquire() {
    long now = clock.getAsLong();
    if (count == 0 || now - windowStartedAt >= WINDOW_MS) {
      windowStartedAt = now;
      count = 0;
    }
    if (count >= MAX_EVENTS) return false;
    count++;
    return true;
  }
}

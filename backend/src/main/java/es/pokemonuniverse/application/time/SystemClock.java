package es.pokemonuniverse.application.time;

import jakarta.inject.Singleton;

/** Reloj de producción. */
@Singleton
public class SystemClock implements Clock {

  @Override
  public long now() {
    return System.currentTimeMillis();
  }
}

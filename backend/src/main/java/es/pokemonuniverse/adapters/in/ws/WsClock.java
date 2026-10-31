package es.pokemonuniverse.adapters.in.ws;

import jakarta.inject.Singleton;

/** Reloj del límite de eventos de {@code /ws}; los tests lo sustituyen para no depender del tiempo real. */
@Singleton
public class WsClock {

  public long now() {
    return System.currentTimeMillis();
  }
}

package es.pokemonuniverse.application.time;

import java.time.Instant;

/** Reloj inyectado de la aplicación: milisegundos desde epoch. Los tests lo sustituyen para mover el tiempo. */
public interface Clock {

  long now();

  /** La misma hora como {@link Instant}, con precisión de milisegundos. */
  default Instant instant() {
    return Instant.ofEpochMilli(now());
  }
}

package es.pokemonuniverse.application.time;

/** Reloj inyectado ({@code Date.now()} en Node): milisegundos desde epoch. */
public interface Clock {

  long now();
}

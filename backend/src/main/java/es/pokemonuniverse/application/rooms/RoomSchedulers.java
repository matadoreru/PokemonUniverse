package es.pokemonuniverse.application.rooms;

/**
 * Temporizadores de sala ({@code setTimeout}/{@code clearTimeout}). El callback se ejecuta fuera del hilo del
 * planificador y debe re-entrar por el lock de la sala y comprobar la identidad del temporizador.
 */
public interface RoomSchedulers {

  /** Programa {@code task} dentro de {@code delayMs} ms; devuelve la acción que lo cancela. */
  Runnable schedule(long delayMs, Runnable task);
}

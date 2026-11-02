package es.pokemonuniverse.application.datasync;

/** Temporizador de un solo disparo del planificador; inyectado para que las pruebas no esperen. */
@FunctionalInterface
public interface SyncTimer {

  /** Programa {@code task} dentro de {@code delayMs}; devuelve la acción que lo cancela. */
  Runnable schedule(Runnable task, long delayMs);
}

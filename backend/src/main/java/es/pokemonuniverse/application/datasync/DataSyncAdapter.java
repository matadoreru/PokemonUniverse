package es.pokemonuniverse.application.datasync;

/**
 * Un origen sincronizable ({@code DataSyncAdapter} de {@code types.ts}). {@link DataSyncService} recibe todos los beans
 * presentes; un origen sin adaptador falla al sincronizarse con {@code No sync adapter registered for <SRC>}.
 */
public interface DataSyncAdapter {

  DataSyncSource source();

  /** Ejecuta la sincronización de forma bloqueante (el servicio la lanza en un hilo virtual). */
  SyncResult run(DataSyncMode mode);

  /** Registros utilizables del origen ya persistidos (p. ej. Pokémon por defecto con {@code hp > 0}). */
  long recordsAvailable();
}

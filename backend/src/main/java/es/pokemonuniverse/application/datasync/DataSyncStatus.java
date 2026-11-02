package es.pokemonuniverse.application.datasync;

/** Enum nativo {@code "DataSyncStatus"} de Postgres: estado de una fila de {@code "DataSyncRun"}. */
public enum DataSyncStatus {
  PENDING,
  RUNNING,
  COMPLETED,
  FAILED
}

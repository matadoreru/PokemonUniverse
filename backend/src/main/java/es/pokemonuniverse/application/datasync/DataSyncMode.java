package es.pokemonuniverse.application.datasync;

/** Enum nativo {@code "DataSyncMode"} de Postgres. */
public enum DataSyncMode {
  INITIAL,
  INCREMENTAL,
  FULL,
  PRICE_REFRESH
}

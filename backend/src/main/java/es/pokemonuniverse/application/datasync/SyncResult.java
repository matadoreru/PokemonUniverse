package es.pokemonuniverse.application.datasync;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;

/**
 * Resultado de {@link DataSyncAdapter#run} ({@code SyncResult} de {@code types.ts}). {@code details} se guarda tal cual
 * en la columna {@code jsonb} de la ejecución; si es {@code null} la columna no se toca.
 */
public record SyncResult(int processed, int inserted, int updated, int skipped, @Nullable String datasetVersion,
    @Nullable JsonNode details) {

  public SyncResult(int processed, int inserted, int updated, int skipped) {
    this(processed, inserted, updated, skipped, null, null);
  }
}

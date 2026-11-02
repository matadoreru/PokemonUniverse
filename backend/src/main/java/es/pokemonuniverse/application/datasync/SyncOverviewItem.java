package es.pokemonuniverse.application.datasync;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;

/**
 * Estado de un origen para la administración ({@code SyncOverviewItem} / {@code AdminDataSyncItem}). Las fechas son
 * cadenas {@code toISOString()} y los nulos se serializan (la configuración global omite los nulos).
 */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record SyncOverviewItem(
    DataSyncSource source,
    Status status,
    boolean ready,
    @Nullable String lastSyncAt,
    @Nullable String lastAttemptAt,
    @Nullable String lastFullSyncAt,
    @Nullable Integer durationMs,
    int recordsProcessed,
    int inserted,
    int updated,
    int skipped,
    int recordsAvailable,
    @Nullable String error,
    String nextSyncAt) {

  /** {@code IDLE} existe en el contrato, pero nunca se produce (como en Node). */
  public enum Status {
    IDLE,
    RUNNING,
    FAILED,
    COMPLETED,
    NOT_READY
  }
}

package es.pokemonuniverse.application.datasync;

import io.micronaut.core.annotation.Nullable;
import java.time.Instant;
import java.util.List;

/** Puerto de persistencia de las tablas {@code "DataSyncRun"} y {@code "DataSyncState"} de Prisma. */
public interface DataSyncRecords {

  /** Pasa a FAILED las ejecuciones PENDING o RUNNING con {@code completedAt} y {@code error}; devuelve cuántas. */
  int failInterrupted(Instant now, String error);

  /** Crea la ejecución en RUNNING con {@code startedAt}; devuelve su id. */
  String createRun(DataSyncSource source, DataSyncMode mode, Instant startedAt);

  /** Upsert del estado con {@code lastAttemptAt}. */
  void markAttempt(DataSyncSource source, Instant attemptedAt);

  /**
   * En una transacción: la ejecución pasa a COMPLETED con contadores y {@code details}, y el estado recibe
   * {@code datasetVersion}, {@code lastSuccessAt}, {@code lastAttemptAt}, {@code recordsAvailable},
   * {@code lastError = null} y {@code lastFullSyncAt} solo en FULL o INITIAL.
   */
  void complete(String runId, DataSyncSource source, DataSyncMode mode, Instant startedAt, Instant completedAt,
      int durationMs, SyncResult result, long recordsAvailable);

  /** En una transacción: la ejecución pasa a FAILED con {@code error} y el estado recibe {@code lastError}. */
  void fail(String runId, DataSyncSource source, Instant startedAt, Instant completedAt, int durationMs,
      String error);

  /** Upsert de {@code recordsAvailable}; al crear la fila también {@code datasetVersion = String(count)}. */
  void recordAvailable(DataSyncSource source, long recordsAvailable);

  List<StoredState> states();

  /** Últimas {@code limit} ejecuciones COMPLETED, FAILED o RUNNING, de la más reciente a la más antigua. */
  List<StoredRun> recentRuns(int limit);

  record StoredState(DataSyncSource source, @Nullable String datasetVersion, @Nullable Instant lastSuccessAt,
      @Nullable Instant lastAttemptAt, @Nullable Instant lastFullSyncAt, int recordsAvailable,
      @Nullable String lastError) {}

  record StoredRun(DataSyncSource source, DataSyncStatus status, @Nullable Integer durationMs, int recordsProcessed,
      int inserted, int updated, int skipped, @Nullable String error) {}
}

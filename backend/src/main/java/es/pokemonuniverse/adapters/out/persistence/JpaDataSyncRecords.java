package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncRecords;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.DataSyncStatus;
import es.pokemonuniverse.application.datasync.SyncResult;
import es.pokemonuniverse.application.time.Clock;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.data.model.Pageable;
import io.micronaut.json.JsonMapper;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.StreamSupport;
import javax.sql.DataSource;
import org.hibernate.query.NativeQuery;

/**
 * Persistencia del data-sync sobre las tablas de Prisma. Las escrituras son SQL nativo: los enums de Postgres se
 * convierten con {@code CAST}, {@code details} es {@code jsonb} y los upserts del estado replican las ramas
 * {@code create}/{@code update} de cada {@code upsert} de {@code service.ts}. {@code "updatedAt"} (el
 * {@code @updatedAt} de Prisma, sin valor por defecto en la BD) se escribe en cada inserción y actualización.
 */
@Singleton
@Requires(beans = DataSource.class)
public class JpaDataSyncRecords implements DataSyncRecords {

  private static final String FAIL_INTERRUPTED = """
      UPDATE "DataSyncRun" SET "status" = 'FAILED', "completedAt" = ?1, "error" = ?2
      WHERE "status" IN ('PENDING', 'RUNNING')
      """;
  private static final String CREATE_RUN = """
      INSERT INTO "DataSyncRun" ("id", "source", "mode", "status", "startedAt", "createdAt")
      VALUES (?1, CAST(?2 AS "DataSyncSource"), CAST(?3 AS "DataSyncMode"), 'RUNNING', ?4, ?4)
      """;
  private static final String MARK_ATTEMPT = """
      INSERT INTO "DataSyncState" ("source", "lastAttemptAt", "updatedAt")
      VALUES (CAST(?1 AS "DataSyncSource"), ?2, ?3)
      ON CONFLICT ("source") DO UPDATE SET "lastAttemptAt" = EXCLUDED."lastAttemptAt",
        "updatedAt" = EXCLUDED."updatedAt"
      """;
  private static final String COMPLETE_RUN = """
      UPDATE "DataSyncRun" SET "status" = 'COMPLETED', "completedAt" = ?2, "durationMs" = ?3,
        "recordsProcessed" = ?4, "inserted" = ?5, "updated" = ?6, "skipped" = ?7,
        "details" = COALESCE(CAST(?8 AS jsonb), "details")
      WHERE "id" = ?1
      """;
  /** {@code lastFullSyncAt} solo en FULL o INITIAL: con {@code null} se conserva el valor anterior. */
  private static final String COMPLETE_STATE = """
      INSERT INTO "DataSyncState" ("source", "datasetVersion", "lastSuccessAt", "lastAttemptAt", "lastFullSyncAt",
        "recordsAvailable", "updatedAt")
      VALUES (CAST(?1 AS "DataSyncSource"), ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT ("source") DO UPDATE SET "datasetVersion" = EXCLUDED."datasetVersion",
        "lastSuccessAt" = EXCLUDED."lastSuccessAt", "lastAttemptAt" = EXCLUDED."lastAttemptAt",
        "lastFullSyncAt" = COALESCE(EXCLUDED."lastFullSyncAt", "DataSyncState"."lastFullSyncAt"),
        "recordsAvailable" = EXCLUDED."recordsAvailable", "lastError" = NULL, "updatedAt" = EXCLUDED."updatedAt"
      """;
  private static final String FAIL_RUN = """
      UPDATE "DataSyncRun" SET "status" = 'FAILED', "completedAt" = ?2, "durationMs" = ?3, "error" = ?4
      WHERE "id" = ?1
      """;
  private static final String FAIL_STATE = """
      INSERT INTO "DataSyncState" ("source", "lastAttemptAt", "lastError", "updatedAt")
      VALUES (CAST(?1 AS "DataSyncSource"), ?2, ?3, ?4)
      ON CONFLICT ("source") DO UPDATE SET "lastAttemptAt" = EXCLUDED."lastAttemptAt",
        "lastError" = EXCLUDED."lastError", "updatedAt" = EXCLUDED."updatedAt"
      """;
  /** {@code datasetVersion} solo en la rama {@code create}, como en Node. */
  private static final String RECORD_AVAILABLE = """
      INSERT INTO "DataSyncState" ("source", "recordsAvailable", "datasetVersion", "updatedAt")
      VALUES (CAST(?1 AS "DataSyncSource"), ?2, ?3, ?4)
      ON CONFLICT ("source") DO UPDATE SET "recordsAvailable" = EXCLUDED."recordsAvailable",
        "updatedAt" = EXCLUDED."updatedAt"
      """;
  private static final List<DataSyncStatus> OVERVIEW_STATUSES =
      List.of(DataSyncStatus.COMPLETED, DataSyncStatus.FAILED, DataSyncStatus.RUNNING);

  private final DataSyncRunRepository runs;
  private final DataSyncStateRepository states;
  private final EntityManager entityManager;
  private final JsonMapper json;
  private final Clock clock;

  /** {@code migrations} fuerza el orden fuera de test: el esquema está migrado antes de escribir. */
  public JpaDataSyncRecords(@Nullable FlywayMigrations migrations, DataSyncRunRepository runs,
      DataSyncStateRepository states, EntityManager entityManager, JsonMapper json, Clock clock) {
    this.runs = runs;
    this.states = states;
    this.entityManager = entityManager;
    this.json = json;
    this.clock = clock;
  }

  @Override
  @Transactional
  public int failInterrupted(Instant now, String error) {
    return query(FAIL_INTERRUPTED).setParameter(1, timestamp(now), Timestamp.class).setParameter(2, error, String.class)
        .executeUpdate();
  }

  @Override
  @Transactional
  public String createRun(DataSyncSource source, DataSyncMode mode, Instant startedAt) {
    var id = UUID.randomUUID().toString();
    query(CREATE_RUN)
        .setParameter(1, id, String.class)
        .setParameter(2, source.name(), String.class)
        .setParameter(3, mode.name(), String.class)
        .setParameter(4, timestamp(startedAt), Timestamp.class)
        .executeUpdate();
    return id;
  }

  @Override
  @Transactional
  public void markAttempt(DataSyncSource source, Instant attemptedAt) {
    query(MARK_ATTEMPT)
        .setParameter(1, source.name(), String.class)
        .setParameter(2, timestamp(attemptedAt), Timestamp.class)
        .setParameter(3, now(), Timestamp.class)
        .executeUpdate();
  }

  @Override
  @Transactional
  public void complete(String runId, DataSyncSource source, DataSyncMode mode, Instant startedAt, Instant completedAt,
      int durationMs, SyncResult result, long recordsAvailable) {
    query(COMPLETE_RUN)
        .setParameter(1, runId, String.class)
        .setParameter(2, timestamp(completedAt), Timestamp.class)
        .setParameter(3, durationMs, Integer.class)
        .setParameter(4, result.processed(), Integer.class)
        .setParameter(5, result.inserted(), Integer.class)
        .setParameter(6, result.updated(), Integer.class)
        .setParameter(7, result.skipped(), Integer.class)
        .setParameter(8, result.details() == null ? null : serialize(result), String.class)
        .executeUpdate();
    var full = mode == DataSyncMode.FULL || mode == DataSyncMode.INITIAL;
    query(COMPLETE_STATE)
        .setParameter(1, source.name(), String.class)
        .setParameter(2, result.datasetVersion(), String.class)
        .setParameter(3, timestamp(completedAt), Timestamp.class)
        .setParameter(4, timestamp(startedAt), Timestamp.class)
        .setParameter(5, full ? timestamp(completedAt) : null, Timestamp.class)
        .setParameter(6, Math.toIntExact(recordsAvailable), Integer.class)
        .setParameter(7, now(), Timestamp.class)
        .executeUpdate();
  }

  @Override
  @Transactional
  public void fail(String runId, DataSyncSource source, Instant startedAt, Instant completedAt, int durationMs,
      String error) {
    query(FAIL_RUN)
        .setParameter(1, runId, String.class)
        .setParameter(2, timestamp(completedAt), Timestamp.class)
        .setParameter(3, durationMs, Integer.class)
        .setParameter(4, error, String.class)
        .executeUpdate();
    query(FAIL_STATE)
        .setParameter(1, source.name(), String.class)
        .setParameter(2, timestamp(startedAt), Timestamp.class)
        .setParameter(3, error, String.class)
        .setParameter(4, now(), Timestamp.class)
        .executeUpdate();
  }

  @Override
  @Transactional
  public void recordAvailable(DataSyncSource source, long recordsAvailable) {
    var count = Math.toIntExact(recordsAvailable);
    query(RECORD_AVAILABLE)
        .setParameter(1, source.name(), String.class)
        .setParameter(2, count, Integer.class)
        .setParameter(3, String.valueOf(count), String.class)
        .setParameter(4, now(), Timestamp.class)
        .executeUpdate();
  }

  @Override
  @Transactional
  public List<StoredState> states() {
    return StreamSupport.stream(states.findAll().spliterator(), false)
        .map(row -> new StoredState(row.getSource(), row.getDatasetVersion(), row.getLastSuccessAt(),
            row.getLastAttemptAt(), row.getLastFullSyncAt(), row.getRecordsAvailable(), row.getLastError()))
        .toList();
  }

  @Override
  @Transactional
  public List<StoredRun> recentRuns(int limit) {
    return runs.findByStatusInOrderByCreatedAtDesc(OVERVIEW_STATUSES, Pageable.from(0, limit)).stream()
        .map(row -> new StoredRun(row.getSource(), row.getStatus(), row.getDurationMs(), row.getRecordsProcessed(),
            row.getInserted(), row.getUpdated(), row.getSkipped(), row.getError()))
        .toList();
  }

  private NativeQuery<?> query(String sql) {
    return entityManager.createNativeQuery(sql).unwrap(NativeQuery.class);
  }

  private Timestamp now() {
    return timestamp(Instant.ofEpochMilli(clock.now()));
  }

  private static Timestamp timestamp(Instant instant) {
    return Timestamp.from(instant);
  }

  private String serialize(SyncResult result) {
    try {
      return json.writeValueAsString(result.details());
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.DataSyncStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Tabla "DataSyncRun" de Prisma: una fila por ejecución. Solo lectura desde JPA; las escrituras son SQL nativo en
 * {@link JpaDataSyncRecords}; {@code details} ({@code jsonb}) solo se escribe y no se mapea.
 */
@Entity
@Table(name = "DataSyncRun")
public class DataSyncRunEntity {

  @Id
  @Column(name = "id")
  private String id;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "source", columnDefinition = "\"DataSyncSource\"")
  private DataSyncSource source;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "mode", columnDefinition = "\"DataSyncMode\"")
  private DataSyncMode mode;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "status", columnDefinition = "\"DataSyncStatus\"")
  private DataSyncStatus status;

  @Column(name = "startedAt")
  private Instant startedAt;

  @Column(name = "completedAt")
  private Instant completedAt;

  @Column(name = "durationMs")
  private Integer durationMs;

  @Column(name = "recordsProcessed")
  private int recordsProcessed;

  @Column(name = "inserted")
  private int inserted;

  @Column(name = "updated")
  private int updated;

  @Column(name = "skipped")
  private int skipped;

  @Column(name = "error")
  private String error;

  @Column(name = "createdAt")
  private Instant createdAt;

  protected DataSyncRunEntity() {}

  public String getId() {
    return id;
  }

  public DataSyncSource getSource() {
    return source;
  }

  public DataSyncMode getMode() {
    return mode;
  }

  public DataSyncStatus getStatus() {
    return status;
  }

  public Instant getStartedAt() {
    return startedAt;
  }

  public Instant getCompletedAt() {
    return completedAt;
  }

  public Integer getDurationMs() {
    return durationMs;
  }

  public int getRecordsProcessed() {
    return recordsProcessed;
  }

  public int getInserted() {
    return inserted;
  }

  public int getUpdated() {
    return updated;
  }

  public int getSkipped() {
    return skipped;
  }

  public String getError() {
    return error;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}

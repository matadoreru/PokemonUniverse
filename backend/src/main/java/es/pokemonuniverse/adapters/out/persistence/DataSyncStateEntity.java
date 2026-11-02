package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.datasync.DataSyncSource;
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
 * Tabla "DataSyncState" de Prisma: el estado vigente de cada origen. Solo lectura desde JPA; los upserts son SQL
 * nativo en {@link JpaDataSyncRecords}. {@code metadata} no se usa.
 */
@Entity
@Table(name = "DataSyncState")
public class DataSyncStateEntity {

  @Id
  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(name = "source", columnDefinition = "\"DataSyncSource\"")
  private DataSyncSource source;

  @Column(name = "datasetVersion")
  private String datasetVersion;

  @Column(name = "lastSuccessAt")
  private Instant lastSuccessAt;

  @Column(name = "lastAttemptAt")
  private Instant lastAttemptAt;

  @Column(name = "lastFullSyncAt")
  private Instant lastFullSyncAt;

  @Column(name = "recordsAvailable")
  private int recordsAvailable;

  @Column(name = "lastError")
  private String lastError;

  @Column(name = "updatedAt")
  private Instant updatedAt;

  protected DataSyncStateEntity() {}

  public DataSyncSource getSource() {
    return source;
  }

  public String getDatasetVersion() {
    return datasetVersion;
  }

  public Instant getLastSuccessAt() {
    return lastSuccessAt;
  }

  public Instant getLastAttemptAt() {
    return lastAttemptAt;
  }

  public Instant getLastFullSyncAt() {
    return lastFullSyncAt;
  }

  public int getRecordsAvailable() {
    return recordsAvailable;
  }

  public String getLastError() {
    return lastError;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}

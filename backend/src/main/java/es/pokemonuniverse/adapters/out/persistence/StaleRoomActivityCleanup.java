package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.context.annotation.Context;
import io.micronaut.context.annotation.Requires;
import jakarta.annotation.PostConstruct;
import java.time.Instant;
import javax.sql.DataSource;

/**
 * Al arrancar (tras {@link PrismaSchemaGuard}), marca como INTERRUPTED las salas y partidas que el proceso anterior
 * dejó abiertas ({@code interruptStaleActivity} de Node). Se puede desactivar con
 * {@code pu.interrupt-stale-rooms=false} mientras Node siga sirviendo salas sobre la misma base de datos.
 */
@Context
@Requires(notEnv = "test")
@Requires(beans = DataSource.class)
@Requires(property = "pu.interrupt-stale-rooms", value = "true", defaultValue = "true")
public class StaleRoomActivityCleanup {

  private final RoomHistoryWriter writer;

  /** {@code guard} fuerza el orden: el esquema está comprobado y migrado antes de escribir. */
  public StaleRoomActivityCleanup(PrismaSchemaGuard guard, RoomHistoryWriter writer) {
    this.writer = writer;
  }

  @PostConstruct
  void interrupt() {
    writer.interruptStaleActivity(Instant.now());
  }
}

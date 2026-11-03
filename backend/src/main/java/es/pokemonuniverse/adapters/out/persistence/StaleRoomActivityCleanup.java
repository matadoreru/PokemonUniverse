package es.pokemonuniverse.adapters.out.persistence;

import io.micronaut.context.annotation.Context;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import jakarta.annotation.PostConstruct;
import java.time.Instant;
import javax.sql.DataSource;

/**
 * Al arrancar (tras {@link FlywayMigrations} cuando existe), marca como INTERRUPTED las salas y partidas que el
 * proceso anterior dejó abiertas ({@code interruptStaleActivity} de Node). Desactivado por defecto: mientras Node sea
 * dueño de las salas y comparta la base de datos, marcaría como interrumpidas sus salas vivas. Se activa con
 * {@code pu.interrupt-stale-rooms=true} en el corte 2D, cuando Java sea el único dueño de las salas.
 */
@Context
@Requires(beans = DataSource.class)
@Requires(property = "pu.interrupt-stale-rooms", value = "true", defaultValue = "false")
public class StaleRoomActivityCleanup {

  private final RoomHistoryWriter writer;

  /**
   * {@code migrations} fuerza el orden fuera de test: el esquema está migrado antes de escribir (en test no
   * existe; Flyway de Micronaut migra antes de crear beans de datos).
   */
  public StaleRoomActivityCleanup(@Nullable FlywayMigrations migrations, RoomHistoryWriter writer) {
    this.writer = writer;
  }

  @PostConstruct
  void interrupt() {
    writer.interruptStaleActivity(Instant.now());
  }
}

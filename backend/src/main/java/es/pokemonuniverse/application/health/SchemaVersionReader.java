package es.pokemonuniverse.application.health;

/** Puerto: comprueba la base de datos y devuelve la versión del esquema (Flyway; si no hay, Prisma). */
public interface SchemaVersionReader {

  String UNKNOWN = "unknown";

  /**
   * Última migración Flyway correcta como {@code "<versión> <descripción>"} (p. ej. {@code "1 baseline"}); sin
   * historial de Flyway, la última {@code migration_name} terminada de Prisma; si no hay ninguna, {@code "unknown"}.
   * Lanza si la BD falla.
   */
  String latestMigration();
}

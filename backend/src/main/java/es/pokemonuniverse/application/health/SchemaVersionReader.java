package es.pokemonuniverse.application.health;

/** Puerto: comprueba la base de datos y devuelve la versión del esquema (Flyway). */
public interface SchemaVersionReader {

  String UNKNOWN = "unknown";

  /**
   * Última migración Flyway correcta como {@code "<versión> <descripción>"} (p. ej. {@code "1 baseline"}); sin
   * historial de Flyway, {@code "unknown"}.
   * Lanza si la BD falla.
   */
  String latestMigration();
}

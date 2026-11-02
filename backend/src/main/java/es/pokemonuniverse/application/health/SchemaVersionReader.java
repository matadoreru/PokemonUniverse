package es.pokemonuniverse.application.health;

/** Puerto: comprueba la base de datos y devuelve la última migración de Prisma aplicada. */
public interface SchemaVersionReader {

  String UNKNOWN = "unknown";

  /** Última {@code migration_name} terminada, o {@code "unknown"} si no hay ninguna; lanza si la BD falla. */
  String latestMigration();
}

package es.pokemonuniverse.adapters.out.persistence;

import java.util.TimeZone;

/**
 * Fija una zona por defecto de la JVM distinta de UTC mientras dura una prueba: un enlace de marcas de tiempo que
 * dependa de ella (p. ej. {@code setTimestamp(Timestamp.from(...))} en JDBC crudo) falla también en un CI en UTC.
 */
public final class NonUtcZone implements AutoCloseable {

  /** +1 h en invierno y +2 h en verano: nunca coincide con UTC. */
  public static final String ZONE = "Europe/Madrid";

  private final TimeZone previous = TimeZone.getDefault();

  private NonUtcZone() {
    TimeZone.setDefault(TimeZone.getTimeZone(ZONE));
  }

  public static NonUtcZone pin() {
    return new NonUtcZone();
  }

  @Override
  public void close() {
    TimeZone.setDefault(previous);
  }
}

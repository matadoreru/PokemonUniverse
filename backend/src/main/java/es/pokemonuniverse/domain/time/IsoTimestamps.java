package es.pokemonuniverse.domain.time;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

/** Marcas de tiempo con el mismo formato que {@code Date.toISOString()} de Node: siempre {@code .SSSZ}. */
public final class IsoTimestamps {

  private static final DateTimeFormatter MILLIS =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

  private IsoTimestamps() {}

  public static String millis(Instant instant) {
    return MILLIS.format(instant.truncatedTo(ChronoUnit.MILLIS));
  }
}

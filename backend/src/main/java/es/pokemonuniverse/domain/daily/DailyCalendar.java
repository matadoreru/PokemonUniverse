package es.pokemonuniverse.domain.daily;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Calendario del reto diario: el día es el de Madrid y cambia a las 00:00 locales, sin configuración. Una partida
 * pertenece a la fecha en la que empezó.
 */
public final class DailyCalendar {

  public static final ZoneId ZONE = ZoneId.of("Europe/Madrid");

  private DailyCalendar() {}

  /** Fecha de Madrid del instante {@code epochMs}. */
  public static LocalDate dateAt(long epochMs) {
    return Instant.ofEpochMilli(epochMs).atZone(ZONE).toLocalDate();
  }

  /**
   * Próxima medianoche de Madrid después de {@code epochMs}, en ms epoch. {@code atStartOfDay(ZONE)} resuelve el
   * cambio de hora: los días de 23 y 25 horas terminan en su medianoche real.
   */
  public static long nextResetAt(long epochMs) {
    return dateAt(epochMs).plusDays(1).atStartOfDay(ZONE).toInstant().toEpochMilli();
  }
}

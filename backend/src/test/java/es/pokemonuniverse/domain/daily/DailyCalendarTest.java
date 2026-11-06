package es.pokemonuniverse.domain.daily;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

/** El día del reto es el de Madrid: cambia a las 00:00 locales, también con el cambio de hora. */
class DailyCalendarTest {

  private static long ms(String instant) {
    return Instant.parse(instant).toEpochMilli();
  }

  @Test
  void zoneIsMadrid() {
    assertEquals(ZoneId.of("Europe/Madrid"), DailyCalendar.ZONE);
  }

  @Test
  void winterMidnightIsUtcPlusOne() {
    // 2026-01-15 en invierno: Madrid es UTC+1.
    assertEquals(LocalDate.parse("2026-01-15"), DailyCalendar.dateAt(ms("2026-01-15T22:59:59Z")));
    assertEquals(LocalDate.parse("2026-01-16"), DailyCalendar.dateAt(ms("2026-01-15T23:00:00Z")));
  }

  @Test
  void summerMidnightIsUtcPlusTwo() {
    // 2026-07-15 en verano: Madrid es UTC+2.
    assertEquals(LocalDate.parse("2026-07-15"), DailyCalendar.dateAt(ms("2026-07-15T21:59:59Z")));
    assertEquals(LocalDate.parse("2026-07-16"), DailyCalendar.dateAt(ms("2026-07-15T22:00:00Z")));
  }

  @Test
  void nextResetIsTheNextMadridMidnight() {
    assertEquals(ms("2026-01-15T23:00:00Z"), DailyCalendar.nextResetAt(ms("2026-01-15T10:00:00Z")));
    assertEquals(ms("2026-07-15T22:00:00Z"), DailyCalendar.nextResetAt(ms("2026-07-15T10:00:00Z")));
    // Justo en la medianoche, la siguiente es la del día después.
    assertEquals(ms("2026-01-16T23:00:00Z"), DailyCalendar.nextResetAt(ms("2026-01-15T23:00:00Z")));
  }

  @Test
  void nextResetOnSpringForwardDay() {
    // 2026-03-29: a las 02:00 se pasa a las 03:00; el día dura 23 h y su medianoche siguiente ya es UTC+2.
    assertEquals(ms("2026-03-29T22:00:00Z"), DailyCalendar.nextResetAt(ms("2026-03-28T23:00:00Z")));
    assertEquals(ms("2026-03-29T22:00:00Z"), DailyCalendar.nextResetAt(ms("2026-03-29T12:00:00Z")));
  }

  @Test
  void nextResetOnFallBackDay() {
    // 2026-10-25: a las 03:00 se vuelve a las 02:00; el día dura 25 h y su medianoche siguiente ya es UTC+1.
    assertEquals(ms("2026-10-25T23:00:00Z"), DailyCalendar.nextResetAt(ms("2026-10-24T22:00:00Z")));
    assertEquals(ms("2026-10-25T23:00:00Z"), DailyCalendar.nextResetAt(ms("2026-10-25T12:00:00Z")));
    assertEquals(LocalDate.parse("2026-10-25"), DailyCalendar.dateAt(ms("2026-10-25T22:59:59Z")));
  }
}

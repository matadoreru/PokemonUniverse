package es.pokemonuniverse.application.datasync;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class NextScheduledSyncTest {

  private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");

  private static Instant at(String iso) {
    return Instant.parse(iso);
  }

  @Test
  void beforeTheHourItIsToday() {
    // 05:59 en Madrid (CET, UTC+1) → 06:00 del mismo día.
    assertEquals(at("2026-01-15T05:00:00Z"), NextScheduledSync.after(at("2026-01-15T04:59:00Z"), 6, 0, MADRID));
    assertEquals(at("2026-01-15T05:00:00Z"), NextScheduledSync.after(at("2026-01-15T04:59:59.999Z"), 6, 0, MADRID));
  }

  @Test
  void atOrAfterTheHourItIsTomorrow() {
    assertEquals(at("2026-01-16T05:00:00Z"), NextScheduledSync.after(at("2026-01-15T05:00:00Z"), 6, 0, MADRID));
    assertEquals(at("2026-01-16T05:00:00Z"), NextScheduledSync.after(at("2026-01-15T05:00:30Z"), 6, 0, MADRID));
    // En verano (CEST, UTC+2).
    assertEquals(at("2026-07-02T04:00:00Z"), NextScheduledSync.after(at("2026-07-01T04:00:00Z"), 6, 0, MADRID));
  }

  @Test
  void theDayChangesAcrossADstTransition() {
    // 29-03-2026: 02:00 CET → 03:00 CEST. El día anterior a las 07:00 → 06:00 CEST del 29 (04:00Z).
    assertEquals(at("2026-03-29T04:00:00Z"), NextScheduledSync.after(at("2026-03-28T06:00:00Z"), 6, 0, MADRID));
  }

  @Test
  void aTimeInsideTheSpringGapResolvesToTheFirstValidInstantOfThatDay() {
    // 02:30 no existe el 29-03-2026 en Madrid: la siguiente hora válida es 03:00 CEST (01:00Z).
    assertEquals(at("2026-03-29T01:00:00Z"), NextScheduledSync.after(at("2026-03-28T23:00:00Z"), 2, 30, MADRID));
    // El día siguiente vuelve a existir: 02:30 CEST (00:30Z).
    assertEquals(at("2026-03-30T00:30:00Z"), NextScheduledSync.after(at("2026-03-29T01:00:00Z"), 2, 30, MADRID));
  }

  @Test
  void anAmbiguousAutumnTimeUsesTheFirstOccurrence() {
    // 25-10-2026: 03:00 CEST → 02:00 CET; 02:30 ocurre dos veces, la primera en CEST (00:30Z).
    assertEquals(at("2026-10-25T00:30:00Z"), NextScheduledSync.after(at("2026-10-24T22:00:00Z"), 2, 30, MADRID));
  }
}

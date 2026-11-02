package es.pokemonuniverse.application.datasync;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

/**
 * {@code nextScheduledSync} de {@code scheduler.ts}: la siguiente aparición de {@code hh:mm} en la zona, estrictamente
 * posterior a {@code now}. Si la hora local de {@code now} ya alcanzó {@code hh:mm} (se ignoran los segundos), toca el
 * día siguiente. Con el cambio de hora: en el hueco de primavera se usa el primer instante válido tras él (Node lanzaba
 * un error); en la hora repetida de otoño, la primera aparición.
 */
public final class NextScheduledSync {

  private NextScheduledSync() {}

  public static Instant after(Instant now, int hour, int minute, ZoneId zone) {
    var local = now.atZone(zone);
    var date = local.toLocalDate();
    if (local.getHour() > hour || local.getHour() == hour && local.getMinute() >= minute) date = date.plusDays(1);
    var target = LocalDateTime.of(date, LocalTime.of(hour, minute));
    var transition = zone.getRules().getTransition(target);
    var next = transition != null && transition.isGap() ? transition.getInstant() : target.atZone(zone).toInstant();
    // Con la fecha elegida por la hora local siempre es posterior; la guarda replica la condición de Node.
    return next.isAfter(now) ? next : after(next, hour, minute, zone);
  }
}

package es.pokemonuniverse.support;

import es.pokemonuniverse.config.ClockBeans;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import jakarta.inject.Singleton;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * {@link Clock} fijo que el test adelanta a mano. Se activa con {@code @Property(name = "test.clock.mutable",
 * value = "true")} y sustituye al {@code Clock.systemUTC()} de {@link ClockBeans}.
 */
@Singleton
@Requires(property = "test.clock.mutable", value = "true")
@Replaces(bean = Clock.class, factory = ClockBeans.class)
public class MutableClock extends Clock {

  private volatile Instant now = Instant.now();

  @Override
  public ZoneId getZone() {
    return ZoneOffset.UTC;
  }

  @Override
  public Clock withZone(ZoneId zone) {
    return Clock.fixed(now, zone);
  }

  @Override
  public Instant instant() {
    return now;
  }

  public void set(Instant instant) {
    this.now = instant;
  }

  public void advance(Duration duration) {
    this.now = now.plus(duration);
  }
}

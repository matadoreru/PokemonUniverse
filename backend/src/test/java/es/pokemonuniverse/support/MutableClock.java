package es.pokemonuniverse.support;

import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.application.time.SystemClock;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import jakarta.inject.Singleton;
import java.time.Duration;
import java.time.Instant;

/**
 * {@link Clock} fijo que el test adelanta a mano. Se activa con {@code @Property(name = "test.clock.mutable",
 * value = "true")} y sustituye al {@link SystemClock}.
 */
@Singleton
@Requires(property = "test.clock.mutable", value = "true")
@Replaces(SystemClock.class)
public class MutableClock implements Clock {

  private volatile Instant now = Instant.now();

  @Override
  public long now() {
    return now.toEpochMilli();
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

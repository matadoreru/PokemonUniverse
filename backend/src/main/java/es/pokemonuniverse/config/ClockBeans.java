package es.pokemonuniverse.config;

import io.micronaut.context.annotation.Factory;
import jakarta.inject.Singleton;
import java.time.Clock;

/** Reloj {@link java.time.Clock} del sistema en UTC; los tests lo sustituyen por uno que se adelanta a mano. */
@Factory
public class ClockBeans {

  @Singleton
  Clock clock() {
    return Clock.systemUTC();
  }
}

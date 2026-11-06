package es.pokemonuniverse.config;

import es.pokemonuniverse.application.daily.DailyKey;
import es.pokemonuniverse.application.daily.DailyResultEvents;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Secondary;
import jakarta.inject.Singleton;
import java.nio.charset.StandardCharsets;

/**
 * Reto diario: la clave de la semilla del día es {@code pu.auth.secret} (no hace falta otra variable de entorno), y el
 * aviso de retos terminados no hace nada hasta que los logros lo sustituyan.
 */
@Factory
public class DailyBeans {

  @Singleton
  DailyKey dailyKey(PuConfig config) {
    return new DailyKey(config.auth().secret().getBytes(StandardCharsets.UTF_8));
  }

  @Singleton
  @Secondary
  DailyResultEvents dailyResultEvents() {
    return DailyResultEvents.NONE;
  }
}

package es.pokemonuniverse.config;

import es.pokemonuniverse.application.gameconfigs.UserGameConfigService;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.StartupEvent;
import io.micronaut.runtime.event.annotation.EventListener;
import jakarta.inject.Singleton;

/**
 * Migra y cachea las configuraciones guardadas al arrancar, después de los beans {@code @Context} (URL JDBC y
 * migraciones Flyway) y antes de aceptar peticiones. El volcado al apagar es el {@code @PreDestroy} del propio servicio.
 *
 * <p>Solo con {@code pu.rooms.enabled=true}: el único lector de la caché es el {@code create()} de las salas, y la
 * migración reescribe filas de {@code UserGameConfig}. Con las salas apagadas el arranque ni lee ni escribe la tabla.
 */
@Singleton
@Requires(beans = UserGameConfigService.class)
@Requires(property = "pu.rooms.enabled", value = "true")
public class UserGameConfigLoader {

  private final UserGameConfigService configs;

  public UserGameConfigLoader(UserGameConfigService configs) {
    this.configs = configs;
  }

  @EventListener
  void load(StartupEvent event) {
    configs.load();
  }
}

package es.pokemonuniverse.config;

import es.pokemonuniverse.application.gameconfigs.UserGameConfigService;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.StartupEvent;
import io.micronaut.runtime.event.annotation.EventListener;
import jakarta.inject.Singleton;

/**
 * {@code await userGameConfigs.load()} de {@code index.ts}: migra y cachea las configuraciones guardadas al arrancar,
 * después de los beans {@code @Context} (URL JDBC y migraciones Flyway) y antes de aceptar peticiones. El apagado
 * ({@code userGameConfigs.flush()}) es el {@code @PreDestroy} del propio servicio.
 *
 * <p>Solo con {@code pu.rooms.enabled=true}: el único lector de la caché es el {@code create()} de las salas Java, y la
 * migración reescribe filas de {@code UserGameConfig}. Con las salas apagadas (producción hasta 2D) Java ni lee ni
 * escribe la tabla de Node al arrancar, para no abrir una ventana de escrituras perdidas contra sus guardados.
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

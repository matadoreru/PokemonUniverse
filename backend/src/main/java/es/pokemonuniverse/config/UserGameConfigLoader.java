package es.pokemonuniverse.config;

import es.pokemonuniverse.application.gameconfigs.UserGameConfigService;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.StartupEvent;
import io.micronaut.runtime.event.annotation.EventListener;
import jakarta.inject.Singleton;

/**
 * {@code await userGameConfigs.load()} de {@code index.ts}: migra y cachea las configuraciones guardadas al arrancar,
 * después de los beans {@code @Context} (URL JDBC y esquema de Prisma) y antes de aceptar peticiones. El apagado
 * ({@code userGameConfigs.flush()}) es el {@code @PreDestroy} del propio servicio.
 */
@Singleton
@Requires(beans = UserGameConfigService.class)
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

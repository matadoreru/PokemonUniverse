package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.config.PuConfig;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Secondary;
import jakarta.inject.Singleton;

/**
 * Beans de sala de la etapa 2A: ajustes desde {@link PuConfig} y los puertos que la 2C sustituirá (preferencias de
 * configuración por usuario y contenido personal del host), vacíos y marcados {@code @Secondary}.
 */
@Factory
public class RoomBeans {

  @Singleton
  RoomSettings roomSettings(PuConfig config) {
    return new RoomSettings(config.roomMaxPlayers(), config.reconnectGraceMs());
  }

  @Singleton
  @Secondary
  UserGameConfigPreferences userGameConfigPreferences() {
    return UserGameConfigPreferences.NO_OP;
  }

  @Singleton
  @Secondary
  HostContentProvider hostContentProvider() {
    return HostContentProvider.EMPTY;
  }
}

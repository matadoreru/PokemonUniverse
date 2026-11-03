package es.pokemonuniverse.config;

import es.pokemonuniverse.application.admin.AdminRecords;
import es.pokemonuniverse.application.admin.AdminService;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.game.GameRegistry;
import io.micronaut.context.BeanProvider;
import io.micronaut.context.annotation.Factory;
import jakarta.inject.Singleton;
import java.time.ZoneId;

/**
 * Servicio de administración. La medianoche de {@code interruptedToday} usa la zona por defecto de la JVM: Node usa
 * la zona local del proceso y ambos la toman de {@code TZ} (en los contenedores, UTC salvo que se defina). No se usa
 * {@code pu.data-sync.time-zone}, que solo decide la hora del planificador.
 */
@Factory
public class AdminBeans {

  @Singleton
  AdminService adminService(AdminRecords records, BeanProvider<RoomCoordinator> rooms, GameRegistry games,
      Clock clock) {
    return new AdminService(records, () -> rooms.get().adminRooms(), games, clock, ZoneId.systemDefault());
  }
}

package es.pokemonuniverse.config;

import es.pokemonuniverse.application.categories.CustomCategoryService;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.BeanCreatedEvent;
import io.micronaut.context.event.BeanCreatedEventListener;
import io.micronaut.context.event.StartupEvent;
import io.micronaut.runtime.event.annotation.EventListener;
import jakarta.inject.Singleton;
import javax.sql.DataSource;

/**
 * Contenido personal del host ({@code index.ts} de Node): la caché de categorías se carga al arrancar y cada cambio de
 * un usuario reemite {@code room:state} si es host de su sala ({@code customCategories.onChanged(uid =>
 * rooms.updateHostCategories(uid))}). Sin {@link DataSource} (contextos de prueba sin BD) no hay nada que cargar.
 */
public final class HostContentWiring {

  private HostContentWiring() {}

  /**
   * Carga la caché de todos los usuarios al arrancar, como el {@code await customCategories.load()} de Node. Con
   * {@link StartupEvent} corre después de los beans {@code @Context} (comprobación de la URL JDBC y del esquema de
   * Prisma) y antes de que el servidor HTTP acepte peticiones.
   */
  @Singleton
  @Requires(beans = DataSource.class)
  public static class CacheLoader {

    private final CustomCategoryService categories;

    public CacheLoader(CustomCategoryService categories) {
      this.categories = categories;
    }

    @EventListener
    void load(StartupEvent event) {
      categories.load();
    }
  }

  /**
   * Suscribe el coordinador en cuanto existe. No se inyecta en el servicio (el coordinador ya depende de él a través de
   * {@code HostContentProvider}); con las salas apagadas el coordinador no llega a crearse y no hay nada que avisar.
   */
  @Singleton
  @Requires(beans = DataSource.class)
  public static class CoordinatorSubscription implements BeanCreatedEventListener<RoomCoordinator> {

    private final CustomCategoryService categories;

    public CoordinatorSubscription(CustomCategoryService categories) {
      this.categories = categories;
    }

    @Override
    public RoomCoordinator onCreated(BeanCreatedEvent<RoomCoordinator> event) {
      var coordinator = event.getBean();
      categories.onChanged(coordinator::updateHostCategories);
      return coordinator;
    }
  }
}

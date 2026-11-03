package es.pokemonuniverse.config;

import es.pokemonuniverse.application.categories.CustomCategoryService;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptService;
import io.micronaut.context.annotation.Requires;
import io.micronaut.context.event.BeanCreatedEvent;
import io.micronaut.context.event.BeanCreatedEventListener;
import io.micronaut.context.event.StartupEvent;
import io.micronaut.runtime.event.annotation.EventListener;
import jakarta.inject.Singleton;
import javax.sql.DataSource;

/**
 * Contenido personal del host ({@code index.ts} de Node): las cachés de categorías y de dilemas se cargan al arrancar
 * y cada cambio de un usuario reemite {@code room:state} si es host de su sala ({@code customCategories.onChanged(uid =>
 * rooms.updateHostCategories(uid))} y {@code wouldYouRatherPrompts.onChanged(uid =>
 * rooms.updateHostWouldYouRatherPrompts(uid))}). Sin {@link DataSource} (contextos de prueba sin BD) no hay nada que
 * cargar.
 */
public final class HostContentWiring {

  private HostContentWiring() {}

  /**
   * Carga las cachés de todos los usuarios al arrancar, como los {@code await customCategories.load()} y
   * {@code await wouldYouRatherPrompts.load()} de Node. Con
   * {@link StartupEvent} corre después de los beans {@code @Context} (comprobación de la URL JDBC y migraciones
   * Flyway) y antes de que el servidor HTTP acepte peticiones.
   *
   * <p>Solo con {@code pu.rooms.enabled=true}: las cachés existen para el {@code HostContentProvider} de las salas
   * Java. Con las salas apagadas (producción hasta 2D) no se cargan, así que {@code GET /api/categories} y
   * {@code GET /api/would-you-rather-prompts} solo ven lo que Java escriba después de arrancar (rutas que nginx no
   * enruta a Java hasta 2D).
   */
  @Singleton
  @Requires(beans = DataSource.class)
  @Requires(property = "pu.rooms.enabled", value = "true")
  public static class CacheLoader {

    private final CustomCategoryService categories;
    private final WouldYouRatherPromptService prompts;

    public CacheLoader(CustomCategoryService categories, WouldYouRatherPromptService prompts) {
      this.categories = categories;
      this.prompts = prompts;
    }

    @EventListener
    void load(StartupEvent event) {
      categories.load();
      prompts.load();
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
    private final WouldYouRatherPromptService prompts;

    public CoordinatorSubscription(CustomCategoryService categories, WouldYouRatherPromptService prompts) {
      this.categories = categories;
      this.prompts = prompts;
    }

    @Override
    public RoomCoordinator onCreated(BeanCreatedEvent<RoomCoordinator> event) {
      var coordinator = event.getBean();
      categories.onChanged(coordinator::updateHostCategories);
      prompts.onChanged(coordinator::updateHostWouldYouRatherPrompts);
      return coordinator;
    }
  }
}

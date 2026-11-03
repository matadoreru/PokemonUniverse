package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.application.categories.CustomCategoryService;
import es.pokemonuniverse.application.categories.CustomCategoryStore;
import es.pokemonuniverse.application.gameconfigs.UserGameConfigService;
import es.pokemonuniverse.application.gameconfigs.UserGameConfigStore;
import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import es.pokemonuniverse.application.wouldyourather.WouldYouRatherPromptService;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.context.ApplicationContext;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Con {@code pu.rooms.enabled=false} (producción hasta el corte 2D) el arranque no toca las tablas de Node ni carga las cachés
 * que solo usan las salas: ni migra {@code UserGameConfig}, ni carga categorías o dilemas, ni refresca el catálogo TCG.
 * Los datos se siembran desde el contexto de la prueba (salas encendidas) y después se arranca un segundo contexto con
 * las salas apagadas sobre la misma BD.
 */
@MicronautTest(transactional = false)
class RoomsDisabledStartupTest {

  @Inject UserRepository users;
  @Inject UserGameConfigStore configs;
  @Inject UserGameConfigService configService;
  @Inject CustomCategoryStore categories;
  @Inject ObjectMapper mapper;

  private JsonNode json(String text) throws IOException {
    return mapper.readValue(text, JsonNode.class);
  }

  private JsonNode stored(String userId) {
    return configs.list().stream().filter(row -> row.userId().equals(userId)).findFirst().orElseThrow().config();
  }

  @Test
  void startupWithRoomsDisabledNeitherWritesUserGameConfigNorLoadsRoomCaches() throws IOException {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var owner = users.save(UserEntity.create(UUID.randomUUID().toString(), "g_" + tag, tag + "@mail.com", "h",
        Instant.now())).getId();
    // Una fila corrupta: la migración la sustituye por la configuración por defecto.
    var legacy = json("\"corrupto\"");
    configs.upsert(owner, "higher-lower", legacy);
    categories.create(UUID.randomUUID().toString(), owner, "Categoría sembrada " + tag, "categoria sembrada " + tag,
        Instant.now());

    try (var context = ApplicationContext.run(Map.of("pu.rooms.enabled", false), "test")) {
      assertFalse(context.containsBean(UserGameConfigLoader.class));
      assertFalse(context.containsBean(HostContentWiring.CacheLoader.class));
      assertFalse(context.containsBean(TcgCatalogStartup.class));
      // Los servicios siguen existiendo (sin cargar) para quien dependa de ellos.
      assertTrue(context.getBean(UserGameConfigService.class).forUser(owner).isEmpty());
      assertTrue(context.getBean(CustomCategoryService.class).list(owner).isEmpty());
      assertTrue(context.getBean(WouldYouRatherPromptService.class).list(owner).isEmpty());
      assertFalse(context.getBean(CachedTcgCardCatalog.class).loaded());
    }
    assertTrue(JsonTree.equal(legacy, stored(owner)), () -> JsonTree.toCanonicalString(stored(owner)));

    // Control: con las salas encendidas, la misma fila sí se migra y se reescribe.
    configService.load();
    assertFalse(JsonTree.equal(legacy, stored(owner)), () -> JsonTree.toCanonicalString(stored(owner)));
    assertTrue(JsonTree.equal(stored(owner), configService.forUser(owner).get("higher-lower")));
  }
}

package es.pokemonuniverse.adapters.out.resources;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

@MicronautTest(startApplication = false)
class ClasspathGameRegistryLoaderTest {

  @Inject GameRegistry registry;
  @Inject ObjectMapper mapper;

  @Test
  void loadsTwentyEightGames() {
    assertEquals(28, registry.list().size());
    assertEquals(28, registry.manifests().size());
    assertTrue(registry.get("pokedex-distance").isPresent());
  }

  @Test
  void registersThePortedEnginesWithTheirManifests() {
    assertTrue(registry.isPorted("higher-lower"));
    assertTrue(registry.isPorted("pokedex-distance"));
    assertTrue(registry.isPorted("shiny-vote"));
    assertFalse(registry.isPorted("sketchmon"));
    assertTrue(registry.engine("sketchmon").isEmpty());
    assertEquals(registry.get("higher-lower").orElseThrow(), registry.engine("higher-lower").orElseThrow().manifest());
    assertThrows(IllegalStateException.class, () -> new GameRegistry(List.of(), java.util.Map.of("higher-lower",
        registry.engine("higher-lower").orElseThrow())));
  }

  @Test
  void exportedFileHasRecommendedGames() {
    var list = registry.list();
    var recommended = list.stream().filter(g -> Boolean.TRUE.equals(g.recommended())).toList();
    assertFalse(recommended.isEmpty());
    assertEquals(recommended, registry.manifests().subList(0, recommended.size()));
  }

  @Test
  void duplicateIdsFailAtStartup() {
    var json = """
        [{"id":"a","name":"A","icon":"x","description":"d","minPlayers":1,"profileStats":{"metrics":[]},"defaultConfig":{}},
         {"id":"a","name":"B","icon":"x","description":"d","minPlayers":1,"profileStats":{"metrics":[]},"defaultConfig":{}}]
        """;
    var in = new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8));
    assertThrows(IllegalStateException.class, () -> ClasspathGameRegistryLoader.load(mapper, in));
  }

  @Test
  void integralConfigNumbersRoundTripWithoutDecimals() throws Exception {
    var json = """
        [{"id":"a","name":"A","icon":"x","description":"d","minPlayers":2,"profileStats":{"metrics":[]},
          "defaultConfig":{"roundSeconds":30,"nested":{"list":[1,2],"flag":true,"text":"t"}}}]
        """;
    List<GameManifest> games = ClasspathGameRegistryLoader.load(mapper,
        new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8))).list();
    var out = mapper.writeValueAsString(games.get(0).defaultConfig());
    assertEquals("{\"roundSeconds\":30,\"nested\":{\"list\":[1,2],\"flag\":true,\"text\":\"t\"}}", out);
  }
}

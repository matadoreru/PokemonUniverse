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
  void loadsThirtyOneGames() {
    assertEquals(31, registry.list().size());
    assertEquals(31, registry.manifests().size());
    assertTrue(registry.get("pokedex-distance").isPresent());
  }

  @Test
  void registersTheEnginesWithTheirManifests() {
    assertTrue(registry.engine("higher-lower").isPresent());
    assertTrue(registry.engine("sketchmon").isPresent());
    assertTrue(registry.engine("juego-inexistente").isEmpty());
    assertEquals(registry.get("higher-lower").orElseThrow(), registry.engine("higher-lower").orElseThrow().manifest());
    assertThrows(IllegalStateException.class, () -> new GameRegistry(List.of(), java.util.Map.of("higher-lower",
        registry.engine("higher-lower").orElseThrow())));
  }

  @Test
  void everyManifestHasAnEngine() {
    var missing = registry.list().stream().map(GameManifest::id).filter(id -> registry.engine(id).isEmpty()).toList();
    assertEquals(List.of(), missing);
  }

  /** Un corte de red breve nunca es un abandono: todos los juegos dan 8 s de margen de reconexión. */
  @Test
  void everyManifestHasAPresenceGrace() {
    var withoutGrace = registry.list().stream().filter(manifest -> !Integer.valueOf(8_000)
        .equals(manifest.presenceGraceMs())).map(GameManifest::id).toList();
    assertEquals(List.of(), withoutGrace);
  }

  /** «Cómo se juega» de la intro y de la ayuda: tres frases cortas y no vacías en cada juego. */
  @Test
  void everyManifestHasThreeShortHowToSentences() {
    var wrong = registry.list().stream().filter(manifest -> manifest.howTo() == null || manifest.howTo().size() != 3
        || manifest.howTo().stream().anyMatch(text -> text == null || text.isBlank() || text.length() > 90
            || !text.equals(text.strip())))
        .map(GameManifest::id).toList();
    assertEquals(List.of(), wrong);
  }

  @Test
  void aManifestWithoutEngineFailsAtStartup() throws Exception {
    var json = """
        [{"id":"a","name":"A","icon":"x","description":"d","howTo":[],"minPlayers":1,"profileStats":{"metrics":[]},"defaultConfig":{}}]
        """;
    var manifests = ClasspathGameRegistryLoader.load(mapper,
        new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
    var error = assertThrows(IllegalStateException.class,
        () -> ClasspathGameRegistryLoader.requireEveryEngine(manifests));
    assertEquals("Manifiestos sin motor en el registro: [a]", error.getMessage());
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
        [{"id":"a","name":"A","icon":"x","description":"d","howTo":[],"minPlayers":1,"profileStats":{"metrics":[]},"defaultConfig":{}},
         {"id":"a","name":"B","icon":"x","description":"d","howTo":[],"minPlayers":1,"profileStats":{"metrics":[]},"defaultConfig":{}}]
        """;
    var in = new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8));
    assertThrows(IllegalStateException.class, () -> ClasspathGameRegistryLoader.load(mapper, in));
  }

  @Test
  void integralConfigNumbersRoundTripWithoutDecimals() throws Exception {
    var json = """
        [{"id":"a","name":"A","icon":"x","description":"d","howTo":[],"minPlayers":2,"profileStats":{"metrics":[]},
          "defaultConfig":{"roundSeconds":30,"nested":{"list":[1,2],"flag":true,"text":"t"}}}]
        """;
    List<GameManifest> games = ClasspathGameRegistryLoader.load(mapper,
        new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8))).list();
    var out = mapper.writeValueAsString(games.get(0).defaultConfig());
    assertEquals("{\"roundSeconds\":30,\"nested\":{\"list\":[1,2],\"flag\":true,\"text\":\"t\"}}", out);
  }
}

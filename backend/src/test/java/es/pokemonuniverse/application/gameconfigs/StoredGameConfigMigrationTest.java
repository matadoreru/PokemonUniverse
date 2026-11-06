package es.pokemonuniverse.application.gameconfigs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import es.pokemonuniverse.adapters.out.resources.ClasspathGameRegistryLoader;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.ConfigIssue;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * {@code migrateStoredGameConfig} contra el de Node: {@code gameconfigs/migration-cases.json} guarda, para los casos
 * del brief (higher-lower y pokemon-bingo), varios refinamientos entre campos y un barrido de sondas sobre cada clave
 * de los 28 juegos, la salida de Node calculada una vez con {@code generate-migration-cases.ts} (junto al JSON). Desde
 * la Fase 3 (modos de juego) el JSON se edita a mano: {@code mode} y sus ajustes en los seis juegos con modos.
 */
class StoredGameConfigMigrationTest {

  private static final ObjectMapper MAPPER = ObjectMapper.getDefault();
  private static final GameRegistry REGISTRY = ClasspathGameRegistryLoader.loadFromClasspath(MAPPER);
  /** El mapper de producción ({@code micronaut.serde.serialization.inclusion: NON_NULL} en application.yml). */
  private static final ObjectMapper PRODUCTION_MAPPER =
      ObjectMapper.create(Map.of("micronaut.serde.serialization.inclusion", "NON_NULL"), "es.pokemonuniverse");
  private static final Map<String, StoredGameConfigMigration> MIGRATIONS = Map.of(
      "NON_EMPTY", new StoredGameConfigMigration(MAPPER), "NON_NULL", new StoredGameConfigMigration(PRODUCTION_MAPPER));

  private record Case(String name, String gameId, JsonNode stored, JsonNode expected) {}

  private static List<Case> cases() throws IOException {
    try (var in = StoredGameConfigMigrationTest.class.getResourceAsStream("/gameconfigs/migration-cases.json")) {
      var tree = MAPPER.readValue(in.readAllBytes(), JsonNode.class);
      var cases = new ArrayList<Case>();
      for (var entry : tree.values()) {
        cases.add(new Case(entry.get("name").getStringValue(), entry.get("gameId").getStringValue(),
            entry.get("stored"), entry.get("expected")));
      }
      return cases;
    }
  }

  @TestFactory
  Stream<DynamicTest> matchesNodeOnEveryPinnedCase() throws IOException {
    var all = cases();
    return MIGRATIONS.entrySet().stream().sorted(Map.Entry.comparingByKey()).flatMap(mode -> all.stream()
        .map(c -> dynamicTest(mode.getKey() + " " + c.name(), () -> {
          var engine = REGISTRY.engine(c.gameId()).orElseThrow();
          var migrated = mode.getValue().migrate(engine, c.stored());
          assertTrue(JsonTree.equal(c.expected(), migrated),
              () -> JsonTree.firstDifference("$", c.expected(), migrated).orElse("orden"));
        })));
  }

  @Test
  void theFixtureCoversTheBriefCasesAndEveryGame() throws IOException {
    var all = cases();
    var games = all.stream().map(Case::gameId).distinct().count();
    assertEquals(28, games);
    for (var name : List.of("higher-lower: clave obsoleta eliminada", "higher-lower: tipo erróneo sustituido por el defecto",
        "higher-lower: array con un elemento inválido sustituido entero", "higher-lower: JSON no objeto",
        "higher-lower: configuración válida sin cambios", "pokemon-bingo: configuración válida sin cambios")) {
      assertTrue(all.stream().anyMatch(c -> c.name().equals(name)), name);
    }
    // Fase 3: una configuración guardada antes de existir `mode` se lee como CLASSIC (sin migración de datos).
    for (var gameId : List.of("pokedex-distance", "higher-lower", "shiny-vote", "learnset-guess", "type-duel",
        "pokemon-impostor")) {
      var name = gameId + ": configuración guardada sin mode se lee como CLASSIC";
      var pinned = all.stream().filter(c -> c.name().equals(name)).findFirst();
      assertTrue(pinned.isPresent(), name);
      assertTrue(pinned.get().stored().get("mode") == null, name);
      assertEquals("CLASSIC", pinned.get().expected().get("mode").getStringValue(), name);
    }
  }

  @Test
  void enginesReportEveryBrokenKeyAtOnceLikeZod() throws IOException {
    var engine = REGISTRY.engine("higher-lower").orElseThrow();
    var raw = MAPPER.readValue("""
        {"generations":"x","categories":7,"showPreviousValue":true,"answerVisibility":"LIVE",
         "difficulty":"NORMAL","roundSeconds":20,"rounds":"z"}""", JsonNode.class);
    assertEquals(List.of(List.of("generations"), List.of("categories"), List.of("rounds")),
        engine.configIssues(raw).stream().map(ConfigIssue::path).toList());
    var bingo = REGISTRY.engine("pokemon-bingo").orElseThrow();
    var families = MAPPER.readValue("""
        {"width":3,"height":3,"durationSeconds":120,"generations":[1],"maxConditionsPerCell":1,
         "families":{"generation":1,"dexNumber":true,"type":"x","typeCombination":true,"typeCount":true,"hp":true,
         "attack":true,"defense":true,"specialAttack":true,"specialDefense":true,"speed":true,"baseStatTotal":false,
         "height":true,"weight":true,"evolutionStage":true,"legendaryStatus":false,"color":false,"abilities":false}}""",
        JsonNode.class);
    assertEquals(List.of(List.of("families", "generation"), List.of("families", "type")),
        bingo.configIssues(families).stream().map(ConfigIssue::path).toList());
    assertEquals(List.of(), bingo.configIssues(MAPPER.writeValueToTree(bingo.defaultConfig())));
  }
}

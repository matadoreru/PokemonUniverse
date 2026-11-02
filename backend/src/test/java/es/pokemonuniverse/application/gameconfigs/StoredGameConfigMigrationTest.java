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
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * {@code migrateStoredGameConfig} contra el de Node: {@code gameconfigs/migration-cases.json} guarda, para los casos
 * del brief (higher-lower y pokemon-bingo), varios refinamientos entre campos y un barrido de sondas sobre cada clave
 * de los 28 juegos, la salida de Node calculada una vez con {@code generate-migration-cases.ts} (junto al JSON).
 */
class StoredGameConfigMigrationTest {

  private static final ObjectMapper MAPPER = ObjectMapper.getDefault();
  private static final GameRegistry REGISTRY = ClasspathGameRegistryLoader.loadFromClasspath(MAPPER);
  private static final StoredGameConfigMigration MIGRATION = new StoredGameConfigMigration(MAPPER);

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
    return cases().stream().map(c -> dynamicTest(c.name(), () -> {
      var engine = REGISTRY.engine(c.gameId()).orElseThrow();
      var migrated = MIGRATION.migrate(engine, c.stored());
      assertTrue(JsonTree.equal(c.expected(), migrated),
          () -> JsonTree.firstDifference("$", c.expected(), migrated).orElse("orden"));
    }));
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
  }

  @Test
  void enginesReportEveryBrokenKeyAtOnceLikeZod() throws IOException {
    var engine = REGISTRY.engine("higher-lower").orElseThrow();
    var raw = MAPPER.readValue("""
        {"generations":"x","categories":7,"showPreviousValue":true,"answerVisibility":"REALTIME",
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

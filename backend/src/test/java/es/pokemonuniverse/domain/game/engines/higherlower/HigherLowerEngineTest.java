package es.pokemonuniverse.domain.game.engines.higherlower;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerChoice;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, configuración por defecto y bordes del parseo. */
class HigherLowerEngineTest {

  private final HigherLowerEngine engine = new HigherLowerEngine(GoldenManifests.of(HigherLowerEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("higher-lower", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("type-chain");
    assertThrows(IllegalArgumentException.class, () -> new HigherLowerEngine(other));
  }

  @Test
  void acceptsIntegralDoublesAndRejectsFractions() throws IOException {
    var base = "\"generations\":[1],\"categories\":[\"HP\"],\"showPreviousValue\":true,"
        + "\"answerVisibility\":\"LIVE\",\"difficulty\":\"NORMAL\",";
    var config = engine.parseConfig(json("{" + base + "\"roundSeconds\":10.0,\"rounds\":1.0}"));
    assertEquals(10, config.roundSeconds());
    assertEquals(1, config.rounds());
    assertThrows(ConfigValidationException.class,
        () -> engine.parseConfig(json("{" + base + "\"roundSeconds\":10.5,\"rounds\":1}")));
    assertThrows(ConfigValidationException.class,
        () -> engine.parseConfig(json("{" + base + "\"roundSeconds\":20,\"rounds\":null}")));
  }

  @Test
  void hidesAnswersUntilRevealByDefaultAndRejectsTheOldRealtimeValue() throws IOException {
    assertEquals(HigherLowerConfig.HigherLowerAnswerVisibility.REVEAL, engine.defaultConfig().answerVisibility());
    var base = "{\"generations\":[1],\"categories\":[\"HP\"],\"showPreviousValue\":true,\"difficulty\":\"NORMAL\","
        + "\"roundSeconds\":10,\"rounds\":1,\"answerVisibility\":";
    assertEquals(HigherLowerConfig.HigherLowerAnswerVisibility.LIVE,
        engine.parseConfig(json(base + "\"LIVE\"}")).answerVisibility());
    assertThrows(ConfigValidationException.class, () -> engine.parseConfig(json(base + "\"REALTIME\"}")));
  }

  @Test
  void grantsTheSpeedBonusOnlyInTheFirstHalfOfTheRound() {
    assertEquals(1, HigherLowerRules.speedBonus(10_999, 1_000, 20));
    assertEquals(0, HigherLowerRules.speedBonus(11_000, 1_000, 20));
  }

  @Test
  void parsesTheStrictAnswerAction() throws IOException {
    assertEquals(HigherLowerChoice.SAME, engine.parseAction(json("{\"type\":\"ANSWER\",\"choice\":\"SAME\"}")).choice());
    for (var invalid : List.of("{\"type\":\"ANSWER\",\"choice\":\"SAME\",\"extra\":1}", "{\"type\":\"ANSWER\"}",
        "{\"type\":\"GUESS\",\"choice\":\"SAME\"}", "{\"type\":\"ANSWER\",\"choice\":\"same\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsAtLeastTwoPokemonInTheSelectedGenerations() {
    var context = GameContext.builder(new InMemoryPokemonCatalog(List.of()), new Mulberry32(1))
        .players(List.of(new GamePlayer("p1", "Ana"))).now(1000).build();
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context));
    assertEquals("Se necesitan al menos dos Pokémon en las generaciones seleccionadas.", error.getMessage());
  }
}

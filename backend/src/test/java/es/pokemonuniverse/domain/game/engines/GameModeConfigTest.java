package es.pokemonuniverse.domain.game.engines;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexConfig;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerConfig;
import es.pokemonuniverse.domain.game.engines.learnsetguess.LearnsetGuessConfig;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceConfig;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorConfig;
import es.pokemonuniverse.domain.game.engines.shinyvote.ShinyVoteConfig;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelConfig;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.function.ThrowingConsumer;

/**
 * Campo {@code mode} común de los seis juegos con modos (Fase 3): {@code CLASSIC} por defecto (una configuración
 * guardada sin {@code mode} se lee como Clásico), el modo nuevo se acepta y cualquier otro valor, también
 * {@code null}, se rechaza, como {@code z.enum(...).default('CLASSIC')}.
 */
class GameModeConfigTest {

  private static final ObjectMapper MAPPER = ObjectMapper.getDefault();

  record Game(String id, Function<JsonNode, Object> parse, Object defaults, String newMode) {}

  static Stream<Game> games() {
    return Stream.of(
        new Game("pokedex-distance", PokedexDistanceConfig::parse, PokedexDistanceConfig.defaults(), "POINTS"),
        new Game("higher-lower", HigherLowerConfig::parse, HigherLowerConfig.defaults(), "ENDLESS"),
        new Game("shiny-vote", ShinyVoteConfig::parse, ShinyVoteConfig.defaults(), "SURVIVAL"),
        new Game("learnset-guess", LearnsetGuessConfig::parse, LearnsetGuessConfig.defaults(), "MANUAL_REVEAL"),
        new Game("type-duel", TypeDuelConfig::parse, TypeDuelConfig.defaults(), "COOP"),
        new Game("pokemon-impostor", PokemonImpostorConfig::parse, PokemonImpostorConfig.defaults(), "ONE_WORD"),
        new Game("absurd-pokedex", AbsurdPokedexConfig::parse, AbsurdPokedexConfig.defaults(), "REAL_ENTRY"));
  }

  private static LinkedHashMap<String, JsonNode> entries(Object config) throws IOException {
    var entries = new LinkedHashMap<String, JsonNode>();
    for (var entry : MAPPER.writeValueToTree(config).entries()) entries.put(entry.getKey(), entry.getValue());
    return entries;
  }

  private static String mode(Object config) throws IOException {
    return MAPPER.writeValueToTree(config).get("mode").getStringValue();
  }

  private static Stream<DynamicTest> forEachGame(ThrowingConsumer<Game> check) {
    return games().map(game -> dynamicTest(game.id(), () -> check.accept(game)));
  }

  @TestFactory
  Stream<DynamicTest> modeDefaultsToClassicAndIsTheLastKey() {
    return forEachGame(GameModeConfigTest::checkDefaultMode);
  }

  @TestFactory
  Stream<DynamicTest> acceptsTheNewModeAndRejectsAnyOtherValue() {
    return forEachGame(GameModeConfigTest::checkModeValues);
  }

  private static void checkDefaultMode(Game game) throws IOException {
    var defaults = entries(game.defaults());
    assertEquals("mode", List.copyOf(defaults.keySet()).getLast());
    assertEquals("CLASSIC", defaults.get("mode").getStringValue());
    defaults.remove("mode");
    assertEquals("CLASSIC", mode(game.parse().apply(JsonNode.createObjectNode(defaults))));
  }

  private static void checkModeValues(Game game) throws IOException {
    var config = entries(game.defaults());
    config.put("mode", JsonNode.createStringNode(game.newMode()));
    assertEquals(game.newMode(), mode(game.parse().apply(JsonNode.createObjectNode(config))));
    config.put("mode", JsonNode.createStringNode("TURBO"));
    var unknown = assertThrows(ConfigValidationException.class,
        () -> game.parse().apply(JsonNode.createObjectNode(config)));
    assertEquals(List.of("mode"), unknown.path());
    config.put("mode", JsonNode.nullNode());
    assertThrows(ConfigValidationException.class, () -> game.parse().apply(JsonNode.createObjectNode(config)));
  }

  @Test
  void pointsRoundsOfDistanceIsBetween3And30WithDefault10() throws IOException {
    assertRange(PokedexDistanceConfig::parse, PokedexDistanceConfig.defaults(), "pointsRounds", 3, 30, 10);
  }

  @Test
  void coopSecondsOfTypeDuelIsBetween30And120WithDefault60() throws IOException {
    assertRange(TypeDuelConfig::parse, TypeDuelConfig.defaults(), "coopSeconds", 30, 120, 60);
  }

  private static void assertRange(Function<JsonNode, Object> parse, Object defaults, String key, int min, int max,
      int fallback) throws IOException {
    var config = entries(defaults);
    assertEquals(fallback, config.get(key).getIntValue());
    config.remove(key);
    assertEquals(fallback, entries(parse.apply(JsonNode.createObjectNode(config))).get(key).getIntValue());
    for (int ok : new int[] {min, max}) {
      config.put(key, JsonNode.createNumberNode(ok));
      assertEquals(ok, entries(parse.apply(JsonNode.createObjectNode(config))).get(key).getIntValue());
    }
    for (var bad : List.of(JsonNode.createNumberNode(min - 1), JsonNode.createNumberNode(max + 1),
        JsonNode.createNumberNode(min + 0.5))) {
      config.put(key, bad);
      var error = assertThrows(ConfigValidationException.class, () -> parse.apply(JsonNode.createObjectNode(config)));
      assertEquals(List.of(key), error.path());
    }
  }
}

package es.pokemonuniverse.domain.game.engines.pokeddlerace;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, parseo y errores de arranque. */
class PokeddleRaceEngineTest {

  private final PokeddleRaceEngine engine = new PokeddleRaceEngine(GoldenManifests.of(PokeddleRaceEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000).build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokeddle-race", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokeddleRaceEngine(other));
  }

  @Test
  void parsesTheStrictGuessAction() throws IOException {
    var longest = "x".repeat(64);
    assertEquals(longest,
        engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "\"}")).pokemonId());
    for (var invalid : List.of("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":25}", "{\"type\":\"SUBMIT_POKEMON\",\"pokemonId\":\"pikachu\"}",
        "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsTheManifestPlayersOneClueAndACompletePool() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context(1)));
    assertEquals("Se necesitan al menos " + engine.manifest().minPlayers() + " jugadores.", error.getMessage());
    // Sin pistas la configuración valida (el esquema no lo impide), pero la partida no arranca.
    var clues = new LinkedHashMap<String, Boolean>();
    for (var key : PokeddleRaceConfig.CLUE_KEYS) clues.put(key, false);
    var noClues = new PokeddleRaceConfig(List.of(1), 20, 10, clues);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(noClues, context(2)));
    assertEquals("Selecciona al menos una pista.", error.getMessage());
    var emptyPool = new PokeddleRaceConfig(List.of(9), 20, 10, engine.defaultConfig().clues());
    error = assertThrows(EngineException.class, () -> engine.createInitialState(emptyPool, context(2)));
    assertEquals("No hay Pokémon con datos completos para esta configuración.", error.getMessage());
  }

  @Test
  void comparesTypesAsSets() {
    assertEquals("EXACT", PokeddleRaceRules.comparePokeddleTypes(List.of("fire", "fire"), List.of("fire")));
    assertEquals("PARTIAL", PokeddleRaceRules.comparePokeddleTypes(List.of("fire", "flying"), List.of("fire")));
    assertEquals("NONE", PokeddleRaceRules.comparePokeddleTypes(List.of("water"), List.of("fire")));
  }
}

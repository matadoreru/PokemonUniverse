package es.pokemonuniverse.domain.game.engines.pokemonredflag;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagConfig.PokemonRedFlagMode;
import es.pokemonuniverse.domain.game.engines.pokemonredflag.PokemonRedFlagTypes.PokemonRedFlagAction;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, parseo y errores de arranque. */
class PokemonRedFlagEngineTest {

  private final PokemonRedFlagEngine engine = new PokemonRedFlagEngine(GoldenManifests.of(PokemonRedFlagEngine.ID));

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
    assertEquals("pokemon-red-flag", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokemonRedFlagEngine(other));
  }

  @Test
  void parsesTheStrictActionsWithTheJsTrim() throws IOException {
    var hundred = "x".repeat(100);
    var submit = engine.parseAction(json("{\"type\":\"SUBMIT_RED_FLAG\",\"text\":\"\\u00a0\\ufeff " + hundred + "\\u3000\"}"));
    assertEquals(hundred, assertInstanceOf(PokemonRedFlagAction.Submit.class, submit).text());
    var draft = engine.parseAction(json("{\"type\":\"UPDATE_RED_FLAG_DRAFT\",\"text\":\"  \"}"));
    assertEquals("  ", assertInstanceOf(PokemonRedFlagAction.UpdateDraft.class, draft).text());
    var vote = engine.parseAction(json("{\"type\":\"VOTE_RED_FLAG\",\"answerId\":\"rf-1-1\"}"));
    assertEquals("rf-1-1", assertInstanceOf(PokemonRedFlagAction.Vote.class, vote).answerId());
    for (var invalid : List.of("{\"type\":\"SUBMIT_RED_FLAG\",\"text\":\"\\u00a0\"}",
        "{\"type\":\"SUBMIT_RED_FLAG\",\"text\":\"" + hundred + "x\"}",
        "{\"type\":\"UPDATE_RED_FLAG_DRAFT\",\"text\":\"" + hundred + " \"}",
        "{\"type\":\"UPDATE_RED_FLAG_DRAFT\",\"text\":\"a\",\"extra\":1}",
        "{\"type\":\"VOTE_RED_FLAG\",\"answerId\":\"\"}",
        "{\"type\":\"VOTE_RED_FLAG\",\"answerId\":\"" + "a".repeat(97) + "\"}",
        "{\"type\":\"VOTE_RED_FLAG\",\"answerId\":1}", "{\"type\":\"OTHER\"}", "{\"text\":\"a\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsThreePlayersAndAPool() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context(2)));
    assertEquals("Pokémon Red Flag necesita al menos 3 jugadores.", error.getMessage());
    var emptyPool = new PokemonRedFlagConfig(List.of(9), 3, 30, false, PokemonRedFlagMode.RED);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(emptyPool, context(3)));
    assertEquals("No hay Pokémon disponibles con esta configuración.", error.getMessage());
  }

  @Test
  void resultsAreUnavailableBeforeTheEnd() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before Pokémon Red Flag finishes", error.getMessage());
  }
}

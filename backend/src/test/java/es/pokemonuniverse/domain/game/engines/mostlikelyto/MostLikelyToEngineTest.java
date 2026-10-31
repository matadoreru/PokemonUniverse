package es.pokemonuniverse.domain.game.engines.mostlikelyto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToConfig.PromptSource;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToAction;
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

/** Lo que las fixtures doradas no cubren: manifiesto, parseo, preguntas oficiales y errores de arranque. */
class MostLikelyToEngineTest {

  private final MostLikelyToEngine engine = new MostLikelyToEngine(GoldenManifests.of(MostLikelyToEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000)
        .hostCustomCategories(List.<SubjectiveCategory>of()).build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("most-likely-to", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new MostLikelyToEngine(other));
  }

  /** Mismo número de preguntas, en el mismo orden, que {@code most-likely-to/prompts.ts}. */
  @Test
  void officialPromptsMatchTheTypeScriptList() {
    var prompts = MostLikelyToPrompts.OFFICIAL;
    assertEquals(40, prompts.size());
    assertEquals(new SubjectiveCategory("most-likely-to-official-01",
        "¿Qué Pokémon sería más probable que llegase tarde a una cita?"), prompts.getFirst());
    assertEquals(new SubjectiveCategory("most-likely-to-official-40",
        "¿Qué Pokémon sería más probable que fuese el jefe final?"), prompts.getLast());
  }

  @Test
  void parsesTheStrictActions() throws IOException {
    var select = engine.parseAction(json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"" + "a".repeat(96) + "\"}"));
    assertEquals("a".repeat(96), assertInstanceOf(MostLikelyToAction.SelectPokemon.class, select).pokemonId());
    var vote = engine.parseAction(json("{\"type\":\"VOTE_ANSWER\",\"playerId\":\"" + "b".repeat(128) + "\"}"));
    assertEquals("b".repeat(128), assertInstanceOf(MostLikelyToAction.VoteAnswer.class, vote).playerId());
    for (var invalid : List.of("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"" + "a".repeat(97) + "\"}",
        "{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"VOTE_ANSWER\",\"playerId\":\"\"}",
        "{\"type\":\"VOTE_ANSWER\",\"playerId\":\"" + "b".repeat(129) + "\"}",
        "{\"type\":\"VOTE_ANSWER\",\"playerId\":1}", "{\"type\":\"OTHER\"}", "{\"pokemonId\":\"a\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsThreePlayersAPoolAndPrompts() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context(2)));
    assertEquals("Most Likely To necesita al menos 3 jugadores.", error.getMessage());
    var emptyPool = new MostLikelyToConfig(List.of(9), 3, 30, 30, PromptSource.OFFICIAL, false);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(emptyPool, context(3)));
    assertEquals("No hay Pokémon disponibles con esta configuración.", error.getMessage());
    var custom = new MostLikelyToConfig(List.of(1), 3, 30, 30, PromptSource.CUSTOM, false);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(custom, context(3)));
    assertEquals("No hay preguntas activas para Most Likely To.", error.getMessage());
  }

  @Test
  void resultsAreUnavailableBeforeTheEnd() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before Most Likely To finishes", error.getMessage());
  }
}

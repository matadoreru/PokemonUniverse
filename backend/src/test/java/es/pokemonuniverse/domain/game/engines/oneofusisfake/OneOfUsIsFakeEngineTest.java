package es.pokemonuniverse.domain.game.engines.oneofusisfake;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeConfig.CategorySource;
import es.pokemonuniverse.domain.game.engines.oneofusisfake.OneOfUsIsFakeTypes.OneOfUsIsFakeAction;
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

/** Lo que las fixtures doradas no cubren: manifiesto, parseo, categorías oficiales y errores de arranque. */
class OneOfUsIsFakeEngineTest {

  private final OneOfUsIsFakeEngine engine = new OneOfUsIsFakeEngine(GoldenManifests.of(OneOfUsIsFakeEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players, List<SubjectiveCategory> hostCategories) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000)
        .hostCustomCategories(hostCategories).build();
  }

  private static OneOfUsIsFakeConfig config(List<Integer> generations, CategorySource source) {
    return new OneOfUsIsFakeConfig(generations, 30, 180, 3, false, source, true);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("one-of-us-is-fake", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new OneOfUsIsFakeEngine(other));
  }

  /** Mismo número de categorías, en el mismo orden, que {@code one-of-us-is-fake/categories.ts}. */
  @Test
  void officialCategoriesMatchTheTypeScriptList() {
    var categories = OneOfUsIsFakeCategories.OFFICIAL;
    assertEquals(49, categories.size());
    assertEquals(new SubjectiveCategory("official-01", "Pokémon que parecen mascotas"), categories.getFirst());
    assertEquals(new SubjectiveCategory("official-49", "Pokémon que parecen jefes finales"), categories.getLast());
  }

  @Test
  void parsesTheStrictActions() throws IOException {
    var select = engine.parseAction(json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"" + "a".repeat(96) + "\"}"));
    assertEquals("a".repeat(96), assertInstanceOf(OneOfUsIsFakeAction.SelectPokemon.class, select).pokemonId());
    var vote = engine.parseAction(json("{\"type\":\"VOTE_PLAYER\",\"playerId\":\"" + "b".repeat(128) + "\"}"));
    assertEquals("b".repeat(128), assertInstanceOf(OneOfUsIsFakeAction.VotePlayer.class, vote).playerId());
    for (var invalid : List.of("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"" + "a".repeat(97) + "\"}",
        "{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"VOTE_PLAYER\",\"playerId\":\"\"}",
        "{\"type\":\"VOTE_PLAYER\",\"playerId\":\"" + "b".repeat(129) + "\"}",
        "{\"type\":\"VOTE_ANSWER\",\"playerId\":\"p1\"}", "{\"pokemonId\":\"a\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  /** No hay mínimo de jugadores: con dos ya arranca. */
  @Test
  void needsAPoolAndTwoCategoriesButNoMinimumPlayers() {
    var state = engine.createInitialState(engine.defaultConfig(), context(2, List.of()));
    assertEquals(GamePhase.GAME_STARTING, state.phase());
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(9), CategorySource.OFFICIAL), context(3, List.of())));
    assertEquals("No hay Pokémon disponibles con esta configuración.", error.getMessage());
    var oneCategory = List.of(new SubjectiveCategory("host-1", "Pokémon que se comerían tu bocadillo"));
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(1), CategorySource.CUSTOM), context(3, oneCategory)));
    assertEquals("Se necesitan al menos 2 categorías activas para iniciar la partida.", error.getMessage());
  }

  @Test
  void resultsAreUnavailableBeforeTheEnd() {
    var context = context(3, List.of());
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }
}

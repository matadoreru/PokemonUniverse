package es.pokemonuniverse.domain.game.engines.secretranking;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engine.infra.PromptSource;
import es.pokemonuniverse.domain.game.engines.secretranking.SecretRankingTypes.SecretRankingState;
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

/** Lo que las fixtures doradas no cubren: manifiesto, parseo, preguntas oficiales, ciclo del pool y errores. */
class SecretRankingEngineTest {

  private static final List<String> SMALL_POOL =
      List.of("bulbasaur", "ivysaur", "venusaur", "charmander", "charmeleon", "charizard", "squirtle");

  private final SecretRankingEngine engine = new SecretRankingEngine(GoldenManifests.of(SecretRankingEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players, long seed) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(seed)).players(list).now(100)
        .hostCustomCategories(List.<SubjectiveCategory>of()).build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("secret-ranking", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new SecretRankingEngine(other));
  }

  /** Mismo número de preguntas, en el mismo orden, que tenía {@code secret-ranking/prompts.ts}. */
  @Test
  void officialPromptsMatchTheTypeScriptList() {
    var prompts = SecretRankingPrompts.OFFICIAL;
    assertEquals(80, prompts.size());
    assertEquals(new SubjectiveCategory("secret-ranking-official-01", "De más adorable a menos adorable"),
        prompts.getFirst());
    assertEquals(new SubjectiveCategory("secret-ranking-official-46",
        "De más probable a menos probable que responda «estoy bien» cuando claramente no lo está"), prompts.get(45));
    assertEquals(new SubjectiveCategory("secret-ranking-official-80",
        "De mejor a peor portavoz durante una invasión alienígena"), prompts.getLast());
  }

  @Test
  void parsesTheStrictRanking() throws IOException {
    var action = engine.parseAction(json(
        "{\"type\":\"SUBMIT_RANKING\",\"pokemonIds\":[\"a\",\"b\",\"c\",\"d\",\"" + "e".repeat(96) + "\"]}"));
    assertEquals(List.of("a", "b", "c", "d", "e".repeat(96)), action.pokemonIds());
    for (var invalid : List.of("{\"type\":\"SUBMIT_RANKING\",\"pokemonIds\":[\"a\",\"a\",\"c\",\"d\",\"e\"]}",
        "{\"type\":\"SUBMIT_RANKING\",\"pokemonIds\":[\"a\",\"b\",\"c\",\"d\"]}",
        "{\"type\":\"SUBMIT_RANKING\",\"pokemonIds\":[\"a\",\"b\",\"c\",\"d\",\"e\",\"f\"]}",
        "{\"type\":\"SUBMIT_RANKING\",\"pokemonIds\":[\"a\",\"b\",\"c\",\"d\",\"\"]}",
        "{\"type\":\"SUBMIT_RANKING\",\"pokemonIds\":[\"a\",\"b\",\"c\",\"d\",\"" + "e".repeat(97) + "\"]}",
        "{\"type\":\"SUBMIT_RANKING\",\"pokemonIds\":[\"a\",\"b\",\"c\",\"d\",5]}",
        "{\"type\":\"SUBMIT_RANKING\",\"pokemonIds\":[\"a\",\"b\",\"c\",\"d\",\"e\"],\"extra\":1}",
        "{\"type\":\"OTHER\",\"pokemonIds\":[\"a\",\"b\",\"c\",\"d\",\"e\"]}", "{\"pokemonIds\":[]}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsThreePlayersFivePokemonAndPrompts() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(engine.defaultConfig(), context(2, 1)));
    assertEquals("Secret Ranking necesita al menos 3 jugadores; se recomiendan 4 o más.", error.getMessage());
    var emptyPool = new SecretRankingConfig(List.of(9), 3, 30, PromptSource.OFFICIAL, false);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(emptyPool, context(3, 1)));
    assertEquals("Se necesitan al menos 5 Pokémon con imagen para esta configuración.", error.getMessage());
    var custom = new SecretRankingConfig(List.of(1), 3, 30, PromptSource.CUSTOM, false);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(custom, context(3, 1)));
    assertEquals("No hay preguntas activas para Secret Ranking.", error.getMessage());
  }

  @Test
  void resultsAreUnavailableBeforeTheEnd() {
    var context = context(3, 1);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before Secret Ranking finishes", error.getMessage());
  }

  private static SecretRankingState resultsWithUsed(List<String> usedPokemonIds) {
    return SecretRankingState.builder()
        .phase(GamePhase.ROUND_RESULTS)
        .config(new SecretRankingConfig(List.of(1), 3, 15, PromptSource.OFFICIAL, false))
        .playerIds(List.of("p1", "p2", "p3"))
        .pokemonPoolIds(SMALL_POOL)
        .promptPool(SecretRankingPrompts.OFFICIAL)
        .usedPokemonIds(usedPokemonIds)
        .roundNumber(1)
        .nextTransitionAt(0L)
        .build();
  }

  /**
   * Las fixtures (pool de 151) no agotan nunca el ciclo; los valores esperados salen del motor TS con el mismo estado y
   * {@code mulberry32(42)}: quedan dos sin usar, se completan con una segunda baraja que abre ciclo nuevo.
   */
  @Test
  void completesTheRoundWithANewCycleWhenFewerThanFiveRemain() {
    var used = List.of("bulbasaur", "ivysaur", "venusaur", "charmander", "charmeleon");
    var next = engine.handleTimeout(resultsWithUsed(used), context(3, 42));
    assertEquals(List.of("squirtle", "charizard", "charmander", "ivysaur", "bulbasaur"), next.currentPokemonIds());
    assertEquals(List.of("charmander", "ivysaur", "bulbasaur"), next.usedPokemonIds());
    assertEquals("secret-ranking-official-49", next.currentPromptId());
  }

  /** Con exactamente cinco sin usar el ciclo se cierra y las usadas se vacían (mismo origen TS). */
  @Test
  void resetsTheCycleWhenTheLastFiveAreUsed() {
    var next = engine.handleTimeout(resultsWithUsed(List.of("bulbasaur", "ivysaur")), context(3, 42));
    assertEquals(List.of("charmander", "venusaur", "squirtle", "charizard", "charmeleon"), next.currentPokemonIds());
    assertEquals(List.of(), next.usedPokemonIds());
  }
}

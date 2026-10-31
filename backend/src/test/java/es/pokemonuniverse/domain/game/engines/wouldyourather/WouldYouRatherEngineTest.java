package es.pokemonuniverse.domain.game.engines.wouldyourather;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherConfig.PromptSource;
import es.pokemonuniverse.domain.game.engines.wouldyourather.WouldYouRatherTypes.WouldYouRatherOption;
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

/** Lo que las fixtures doradas no cubren: manifiesto, parseo, parejas oficiales y errores de arranque. */
class WouldYouRatherEngineTest {

  private final WouldYouRatherEngine engine = new WouldYouRatherEngine(GoldenManifests.of(WouldYouRatherEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players, List<WouldYouRatherPromptPair> hostPrompts) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000)
        .hostWouldYouRatherPrompts(hostPrompts).build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("would-you-rather", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new WouldYouRatherEngine(other));
  }

  /** Mismo número de parejas, en el mismo orden, que {@code would-you-rather/prompts.ts}. */
  @Test
  void officialPromptsMatchTheTypeScriptList() {
    var prompts = WouldYouRatherPrompts.OFFICIAL;
    assertEquals(36, prompts.size());
    assertEquals(new WouldYouRatherPromptPair("would-you-rather-official-01",
        "Que Gengar cuente tu historial de búsqueda en una cena familiar",
        "Que Mr. Mime lo represente entero con mímica"), prompts.getFirst());
    assertEquals(new WouldYouRatherPromptPair("would-you-rather-official-36", "Compartir tus snacks con Munchlax",
        "Compartir tu conexión wifi con Porygon-Z"), prompts.getLast());
  }

  @Test
  void parsesTheStrictBallot() throws IOException {
    var action = engine.parseAction(json("{\"type\":\"SUBMIT_BALLOT\",\"preference\":\"A\",\"prediction\":\"B\"}"));
    assertEquals(WouldYouRatherOption.A, action.preference());
    assertEquals(WouldYouRatherOption.B, action.prediction());
    for (var invalid : List.of("{\"type\":\"SUBMIT_BALLOT\",\"preference\":\"C\",\"prediction\":\"B\"}",
        "{\"type\":\"SUBMIT_BALLOT\",\"preference\":\"a\",\"prediction\":\"B\"}",
        "{\"type\":\"SUBMIT_BALLOT\",\"preference\":\"A\"}",
        "{\"type\":\"SUBMIT_BALLOT\",\"preference\":\"A\",\"prediction\":\"B\",\"extra\":1}",
        "{\"type\":\"OTHER\",\"preference\":\"A\",\"prediction\":\"B\"}",
        "{\"preference\":\"A\",\"prediction\":\"B\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsThreePlayersAndPrompts() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(engine.defaultConfig(), context(2, List.of())));
    assertEquals("Would You Rather necesita al menos 3 jugadores.", error.getMessage());
    var custom = new WouldYouRatherConfig(3, 30, PromptSource.CUSTOM);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(custom, context(3, List.of())));
    assertEquals("No hay parejas activas para Would You Rather.", error.getMessage());
  }

  @Test
  void resultsAreUnavailableBeforeTheEnd() {
    var context = context(3, List.of());
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before Would You Rather finishes", error.getMessage());
  }
}

package es.pokemonuniverse.domain.game.engines.pokedexdistance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceConfig.SelectionVisibility;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistanceAction;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, configuración por defecto, parseo y errores de arranque. */
class PokedexDistanceEngineTest {

  private final PokedexDistanceEngine engine = new PokedexDistanceEngine(GoldenManifests.of(PokedexDistanceEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new java.util.ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000).build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokedex-distance", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokedexDistanceEngine(other));
  }

  @Test
  void acceptsIntegralDoublesAndRejectsFractions() throws IOException {
    assertEquals(10, engine.parseConfig(
        json("{\"generations\":[1.0],\"roundSeconds\":10.0,\"selectionVisibility\":\"HIDDEN\"}")).roundSeconds());
    assertThrows(ConfigValidationException.class, () -> engine.parseConfig(
        json("{\"generations\":[1],\"roundSeconds\":null,\"selectionVisibility\":\"HIDDEN\"}")));
  }

  @Test
  void selectionVisibilityDefaultsToHiddenAndIsRequired() throws IOException {
    assertEquals(SelectionVisibility.HIDDEN, engine.defaultConfig().selectionVisibility());
    assertEquals(SelectionVisibility.LIVE, engine.parseConfig(
        json("{\"generations\":[1],\"roundSeconds\":20,\"selectionVisibility\":\"LIVE\"}")).selectionVisibility());
    var missing = assertThrows(ConfigValidationException.class,
        () -> engine.parseConfig(json("{\"generations\":[1],\"roundSeconds\":20}")));
    assertEquals("Configuración de Pokédex Distance no válida: falta selectionVisibility.", missing.getMessage());
    var invalid = assertThrows(ConfigValidationException.class, () -> engine.parseConfig(
        json("{\"generations\":[1],\"roundSeconds\":20,\"selectionVisibility\":\"SECRET\"}")));
    assertEquals("Configuración de Pokédex Distance no válida: selectionVisibility tiene un valor no válido.",
        invalid.getMessage());
  }

  @Test
  void hiddenAcceptsDuplicatePicksAndOnlyPublishesWhoPicked() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var first = engine.handleAction(state, "p1", new PokedexDistanceAction("pikachu"), context);
    var second = engine.handleAction(first.state(), "p2", new PokedexDistanceAction("pikachu"), context);
    assertTrue(first.accepted());
    assertTrue(second.accepted());
    assertEquals(List.of(), second.state().lockedPokemonIds());
    var view = engine.getPublicState(second.state(), context);
    assertTrue(view.selections().isEmpty());
    assertEquals(List.of("p1", "p2"), view.selectedIds());
    assertEquals("pikachu", engine.getPlayerState(second.state(), "p1", context).selection().pokemonId());
  }

  /** Dos jugadores con el mismo Pokémon más cercano sobreviven los dos: la eliminación va por jugador, no por Pokémon. */
  @Test
  void hiddenDuplicateClosestPickKeepsBothPlayers() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context).toBuilder()
        .targetDexNumber(1)
        .build();
    state = engine.handleAction(state, "p1", new PokedexDistanceAction("bulbasaur"), context).state();
    state = engine.handleAction(state, "p2", new PokedexDistanceAction("bulbasaur"), context).state();
    state = engine.handleAction(state, "p3", new PokedexDistanceAction("mew"), context).state();
    var round = state.lastRound();
    assertEquals(PokedexDistanceTypes.RoundReason.FARTHEST, round.reason());
    assertEquals(List.of("p3"), round.eliminatedIds());
    assertEquals(0, round.selections().get("p1").distance());
    assertEquals(0, round.selections().get("p2").distance());
    assertEquals(1, state.playerStats().get("p1").exactHits());
    assertEquals(1, state.playerStats().get("p2").exactHits());
  }

  @Test
  void liveKeepsTheLockAndTheLiveSelections() {
    var context = context(3);
    var live = new PokedexDistanceConfig(List.of(1, 2), 20, SelectionVisibility.LIVE);
    var state = engine.start(engine.createInitialState(live, context), context);
    var first = engine.handleAction(state, "p1", new PokedexDistanceAction("pikachu"), context);
    var duplicate = engine.handleAction(first.state(), "p2", new PokedexDistanceAction("pikachu"), context);
    assertEquals("Ese Pokémon ya ha sido elegido.", duplicate.error());
    var view = engine.getPublicState(first.state(), context);
    assertEquals("Pikachu", view.selections().get("p1").pokemonName());
    assertEquals(List.of("p1"), view.selectedIds());
    assertEquals(List.of("pikachu"), view.lockedPokemonIds());
  }

  @Test
  void parsesTheStrictSelectAction() throws IOException {
    assertEquals("pikachu", engine.parseAction(json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"pikachu\"}")).pokemonId());
    var longest = "x".repeat(64);
    assertEquals(longest, engine.parseAction(json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"" + longest + "\"}"))
        .pokemonId());
    for (var invalid : List.of("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"SELECT_POKEMON\",\"pokemonId\":25}", "{\"type\":\"SELECT_POKEMON\"}",
        "{\"type\":\"ANSWER\",\"pokemonId\":\"pikachu\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsTheMinimumPlayersAndAPoolLargeEnough() {
    var config = engine.defaultConfig();
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(config, context(1)));
    assertEquals("At least 2 players are required", error.getMessage());
    var tiny = new PokedexDistanceConfig(List.of(9), 20, SelectionVisibility.HIDDEN); // gen1-2 no tiene Pokémon de la generación 9
    error = assertThrows(EngineException.class, () -> engine.createInitialState(tiny, context(2)));
    assertEquals("The Pokémon pool is too small for this player count", error.getMessage());
  }

  @Test
  void startsOnlyOnce() {
    var context = context(2);
    var started = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var error = assertThrows(EngineException.class, () -> engine.start(started, context));
    assertEquals("Game already started", error.getMessage());
  }
}

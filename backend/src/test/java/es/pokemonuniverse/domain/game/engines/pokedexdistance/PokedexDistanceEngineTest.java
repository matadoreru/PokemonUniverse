package es.pokemonuniverse.domain.game.engines.pokedexdistance;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceConfig.SelectionVisibility;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistanceAction;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import es.pokemonuniverse.support.EngineTestKit;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, configuración por defecto, parseo y errores de arranque. */
class PokedexDistanceEngineTest {

  private final PokedexDistanceEngine engine = new PokedexDistanceEngine(GoldenManifests.of(PokedexDistanceEngine.ID));

  private static GameContext context(int players) {
    return EngineTestKit.context(players);
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

  private static GameContext contextAt(int players, long now) {
    return EngineTestKit.builder(players).now(now).build();
  }

  /** Estado en el tercer desempate entre p1 y p2 con objetivo #1 (Carla, si la hay, sobrevive fuera). */
  private PokedexDistanceTypes.PokedexDistanceState thirdTiebreak(int players) {
    var context = contextAt(players, 1000);
    return engine.start(engine.createInitialState(engine.defaultConfig(), context), context).toBuilder()
        .phase(es.pokemonuniverse.domain.game.engine.GamePhase.TIEBREAKER_ACTIVE)
        .tiebreakDepth(PokedexDistanceRules.MAX_TIEBREAK_DEPTH)
        .eligibleIds(List.of("p1", "p2"))
        .targetDexNumber(1)
        .build();
  }

  @Test
  void identicalPicksAtTheTiebreakCapResolveBySelectedAt() {
    assertEquals(3, PokedexDistanceRules.MAX_TIEBREAK_DEPTH);
    var state = thirdTiebreak(3);
    state = engine.handleAction(state, "p2", new PokedexDistanceAction("bulbasaur"), contextAt(3, 2000)).state();
    state = engine.handleAction(state, "p1", new PokedexDistanceAction("bulbasaur"), contextAt(3, 3000)).state();
    var round = state.lastRound();
    assertEquals(PokedexDistanceTypes.RoundReason.FARTHEST, round.reason());
    assertEquals(List.of("p1"), round.eliminatedIds());
    assertEquals(List.of("p2", "p1"), round.tiedIds());
    assertEquals(List.of("p2", "p3"), state.survivorIds());
    assertEquals(0, state.pendingTiebreakDepth());
  }

  @Test
  void identicalPicksWithTheSameSelectedAtAtTheCapEliminateAllTied() {
    var state = thirdTiebreak(2);
    var context = contextAt(2, 2000);
    state = engine.handleAction(state, "p1", new PokedexDistanceAction("mew"), context).state();
    state = engine.handleAction(state, "p2", new PokedexDistanceAction("mew"), context).state();
    assertEquals(List.of("p1", "p2"), state.lastRound().eliminatedIds());
    assertEquals(List.of(), state.survivorIds());
    state = engine.handleTimeout(state, contextAt(2, state.nextTransitionAt()));
    assertTrue(engine.isFinished(state));
    assertEquals(null, state.winnerId());
  }

  @Test
  void liveKeepsTheLockAndTheLiveSelections() {
    var context = context(3);
    var live = new PokedexDistanceConfig(List.of(1, 2), 20, SelectionVisibility.LIVE, 10, PokedexDistanceMode.CLASSIC);
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
    var tiny = new PokedexDistanceConfig(List.of(9), 20, SelectionVisibility.HIDDEN, 10, PokedexDistanceMode.CLASSIC); // gen1-2 no tiene Pokémon de la generación 9
    error = assertThrows(EngineException.class, () -> engine.createInitialState(tiny, context(2)));
    assertEquals("The Pokémon pool is too small for this player count", error.getMessage());
  }

  @Test
  void pointsModeStartsWithOnePlayer() {
    var context = context(1);
    var started = engine.start(engine.createInitialState(points(3), context), context);
    assertEquals(List.of("p1"), started.eligibleIds());
  }

  @Test
  void classicStillNeedsTwoPlayers() {
    var classic = new PokedexDistanceConfig(List.of(1, 2), 20, SelectionVisibility.HIDDEN, 10, PokedexDistanceMode.CLASSIC);
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(classic, context(1)));
    assertEquals("At least 2 players are required", error.getMessage());
  }

  @Test
  void startsOnlyOnce() {
    var context = context(2);
    var started = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var error = assertThrows(EngineException.class, () -> engine.start(started, context));
    assertEquals("Game already started", error.getMessage());
  }

  // --- Modo Por puntos ---

  private static PokedexDistanceConfig points(int rounds) {
    return new PokedexDistanceConfig(List.of(1, 2), 20, SelectionVisibility.HIDDEN, rounds, PokedexDistanceMode.POINTS);
  }

  @Test
  void pointsPerRoundFormula() {
    assertEquals(150, PokedexDistanceRules.pointsForDistance(0));
    assertEquals(70, PokedexDistanceRules.pointsForDistance(30));
    assertEquals(0, PokedexDistanceRules.pointsForDistance(120));
    assertEquals(0, PokedexDistanceRules.pointsForDistance(null));
  }

  @Test
  void pointsModeNeverEliminates() {
    var context = contextAt(3, 1000);
    var state = engine.start(engine.createInitialState(points(3), context), context).toBuilder()
        .targetDexNumber(1)
        .build();
    state = engine.handleAction(state, "p1", new PokedexDistanceAction("bulbasaur"), context).state();
    state = engine.handleAction(state, "p2", new PokedexDistanceAction("charmander"), context).state();
    // p3 no elige: vence el tiempo, pero nadie cae.
    state = engine.handleTimeout(state, contextAt(3, state.roundEndsAt()));
    var round = state.lastRound();
    assertEquals(PokedexDistanceTypes.RoundReason.SCORED, round.reason());
    assertEquals(List.of(), round.eliminatedIds());
    assertEquals(List.of(), round.tiedIds());
    assertEquals(List.of("p1", "p2", "p3"), state.survivorIds());
    assertEquals(List.of(), state.spectatorIds());
    assertEquals(150, round.points().get("p1"));
    assertEquals(97, round.points().get("p2"));
    assertEquals(0, round.points().get("p3"));
    var view = engine.getPublicState(state, context);
    assertEquals(PokedexDistanceMode.POINTS, view.mode());
    assertEquals(150, view.scores().get("p1"));
    assertEquals(0, view.scores().get("p3"));
    assertEquals(150, view.lastRound().points().get("p1"));
    state = engine.handleTimeout(state, contextAt(3, state.nextTransitionAt()));
    assertEquals(List.of("p1", "p2", "p3"), state.eligibleIds());
    assertEquals(0, state.tiebreakDepth());
    assertEquals(2, engine.getPublicState(state, context).pointsRound());
  }

  /** Las elecciones ocultas no mueven el marcador hasta la revelación: no adelantan la distancia de nadie. */
  @Test
  void pointsModeScoresOnlyMoveAtTheReveal() {
    var context = contextAt(3, 1000);
    var state = engine.start(engine.createInitialState(points(3), context), context).toBuilder()
        .targetDexNumber(1)
        .build();
    state = engine.handleAction(state, "p1", new PokedexDistanceAction("bulbasaur"), context).state();
    var view = engine.getPublicState(state, context);
    assertEquals(0, view.scores().get("p1"));
    assertEquals(Map.of(), view.selections());
  }

  @Test
  void pointsModeEndsAfterPointsRounds() {
    var state = engine.start(engine.createInitialState(points(3), contextAt(2, 1000)), contextAt(2, 1000));
    for (int round = 1; round <= 3; round++) {
      assertEquals(round, state.roundNumber());
      state = engine.handleTimeout(state, contextAt(2, state.roundEndsAt()));
      assertEquals(es.pokemonuniverse.domain.game.engine.GamePhase.ROUND_RESULTS, state.phase());
      state = engine.handleTimeout(state, contextAt(2, state.nextTransitionAt()));
    }
    assertTrue(engine.isFinished(state));
    var view = engine.getPublicState(state, contextAt(2, 1000));
    assertEquals(3, view.pointsRounds());
    assertEquals(3, view.roundHistory().size());
  }

  @Test
  void pointsModeTieSharesPosition() {
    var state = engine.start(engine.createInitialState(points(3), contextAt(3, 1000)), contextAt(3, 1000));
    for (int round = 1; round <= 3; round++) {
      var context = contextAt(3, state.roundStartedAt() + 1000);
      state = state.toBuilder().targetDexNumber(10).build();
      state = engine.handleAction(state, "p1", new PokedexDistanceAction("bulbasaur"), context).state();
      state = engine.handleAction(state, "p2", new PokedexDistanceAction("bulbasaur"), context).state();
      state = engine.handleAction(state, "p3", new PokedexDistanceAction("mew"), context).state();
      state = engine.handleTimeout(state, contextAt(3, state.nextTransitionAt()));
    }
    assertTrue(engine.isFinished(state));
    var results = engine.getResults(state);
    assertEquals(null, results.winnerId());
    var standings = results.standings();
    assertEquals(List.of("p1", "p2", "p3"), standings.stream().map(s -> s.playerId()).toList());
    assertEquals(List.of(1, 1, 3), standings.stream().map(s -> s.position()).toList());
    assertEquals(List.of(273, 273, 0), standings.stream().map(s -> s.points()).toList());
  }
}

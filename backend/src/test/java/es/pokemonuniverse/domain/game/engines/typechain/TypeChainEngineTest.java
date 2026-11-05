package es.pokemonuniverse.domain.game.engines.typechain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainAction;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainFinishReason;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainPlayerStats;
import es.pokemonuniverse.domain.game.engines.typechain.TypeChainTypes.TypeChainState;
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

/** Lo que las fixtures doradas no cubren: manifiesto, parseo, errores de arranque y ramas que el flujo no alcanza. */
class TypeChainEngineTest {

  private final TypeChainEngine engine = new TypeChainEngine(GoldenManifests.of(TypeChainEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(7)).players(list).now(1000).build();
  }

  private TypeChainState started(GameContext context) {
    return engine.start(engine.createInitialState(new TypeChainConfig(List.of(1), 15), context), context);
  }

  /** Un envío válido: un Pokémon sin usar del tipo de la cadena. */
  private static String validContinuation(TypeChainState state, GameContext context) {
    var pool = state.poolIds().stream().map(id -> context.pokemon().byId(id).orElseThrow()).toList();
    return TypeChainRules.getValidTypeChainCandidates(state.chainType(), pool, state.usedPokemonIds()).getFirst().id();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("type-chain", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new TypeChainEngine(other));
  }

  @Test
  void parsesTheStrictSubmitAction() throws IOException {
    var longest = "x".repeat(96);
    assertEquals(longest,
        engine.parseAction(json("{\"type\":\"SUBMIT_POKEMON\",\"pokemonId\":\"" + longest + "\"}")).pokemonId());
    for (var invalid : List.of("{\"type\":\"SUBMIT_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"SUBMIT_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"SUBMIT_POKEMON\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"SUBMIT_POKEMON\",\"pokemonId\":25}", "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\"}",
        "{\"pokemonId\":\"pikachu\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsTheManifestPlayersAndAChainablePool() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context(1)));
    assertEquals("Se necesitan al menos " + engine.manifest().minPlayers() + " jugadores.", error.getMessage());
    error = assertThrows(EngineException.class,
        () -> engine.createInitialState(new TypeChainConfig(List.of(9), 15), context(2)));
    assertEquals("No hay suficientes Pokémon para crear una cadena con esta configuración.", error.getMessage());
  }

  /** La primera cadena empieza vacía, con un tipo que tiene Pokémon suficientes y sin precargar nada. */
  @Test
  void startsOnlyOnceWithAnEmptyChainOfAnEligibleType() {
    var preloaded = new ArrayList<String>();
    var context = context(2).toBuilder().preloadImage(preloaded::add).build();
    var state = started(context);
    assertEquals(List.of(), preloaded);
    assertEquals(List.of(), state.chain());
    assertEquals(List.of(state.chainType()), state.usedChainTypes());
    var pool = state.poolIds().stream().map(id -> context.pokemon().byId(id).orElseThrow()).toList();
    assertTrue(TypeChainRules.typeChainEligibleTypes(pool).contains(state.chainType()));
    var error = assertThrows(EngineException.class, () -> engine.start(state, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }

  /** Estados que el flujo público no produce: el jugador actual desconectado sin aviso de presencia o sin tipo. */
  @Test
  void returnsTheServerLiteralsForUnreachableStates() {
    var context = context(3);
    var state = started(context);
    var current = state.currentPlayerId();
    var offline = context.withPlayers(context.players().stream()
        .map(player -> player.id().equals(current) ? new GamePlayer(player.id(), player.displayName(), false, null)
            : player)
        .toList());
    var result = engine.handleAction(state, current, new TypeChainAction("pikachu"), offline);
    assertEquals("Ya no participas en esta cadena.", result.error());
    var withoutType = state.toBuilder().chainType(null).build();
    result = engine.handleAction(withoutType, current, new TypeChainAction("pikachu"), context.withNow(2000));
    assertEquals("La cadena no tiene tipo.", result.error());
    var error = assertThrows(EngineException.class,
        () -> engine.handleTimeout(withoutType, context.withNow(state.roundEndsAt())));
    assertEquals("La cadena no tiene tipo.", error.getMessage());
    var emptyPool = state.toBuilder().poolIds(List.of()).build();
    error = assertThrows(EngineException.class,
        () -> engine.handleTimeout(emptyPool, context.withNow(state.roundEndsAt())));
    assertEquals("No hay Pokémon suficientes para crear una cadena con esta configuración.", error.getMessage());
  }

  /**
   * El turno 500 termina la partida por {@code MAX_TURNS}: con todos en pie, gana quien más nombró (y, a igualdad, quien
   * menos falló) o nadie si empatan en todo.
   */
  @Test
  void finishesByMaxTurnsWithTheFailsafeRanking() {
    var context = context(3).withNow(2000);
    var state = started(context);
    var current = state.currentPlayerId();
    var others = state.turnOrder().stream().filter(id -> !id.equals(current)).toList();
    var stats = new LinkedHashMap<String, TypeChainPlayerStats>();
    stats.put(current, TypeChainPlayerStats.ZERO);
    stats.put(others.get(0), new TypeChainPlayerStats(1, 2, 1, 0));
    stats.put(others.get(1), new TypeChainPlayerStats(1, 0, 1, 0));
    var lastTurn = state.toBuilder().completedTurns(TypeChainEngine.MAX_TURNS - 1).playerStats(stats).build();
    var finished = engine.handleAction(lastTurn, current, new TypeChainAction(validContinuation(state, context)),
        context).state();
    assertEquals(GamePhase.GAME_RESULTS, finished.phase());
    assertEquals(TypeChainFinishReason.MAX_TURNS, finished.finishReason());
    // current y others[1] tienen 1 Pokémon nombrado y 0 inválidos: empate en cabeza, sin ganador.
    assertNull(finished.winnerId());
    var standings = engine.getResults(finished).standings();
    var tiedFirst = standings.stream().filter(standing -> standing.position() == 1).map(GameStanding::playerId)
        .sorted().toList();
    assertEquals(List.of(current, others.get(1)).stream().sorted().toList(), tiedFirst);
    assertEquals(3, standings.getLast().position());
    assertFalse(standings.stream().anyMatch(standing -> Boolean.TRUE.equals(standing.won())));

    stats.put(others.get(1), new TypeChainPlayerStats(1, 1, 1, 0));
    var withLeader = lastTurn.toBuilder().playerStats(stats).build();
    finished = engine.handleAction(withLeader, current, new TypeChainAction(validContinuation(state, context)),
        context).state();
    assertEquals(current, finished.winnerId());
    assertEquals(List.of(1, 2, 3), engine.getResults(finished).standings().stream().map(GameStanding::position).toList());
  }

  @Test
  void winnerWithASingleSurvivorAndRankingOfEliminated() {
    var context = context(2).withNow(2000);
    var state = started(context);
    var current = state.currentPlayerId();
    var other = state.turnOrder().stream().filter(id -> !id.equals(current)).findFirst().orElseThrow();
    var alone = state.toBuilder().activePlayerIds(List.of(current)).completedTurns(TypeChainEngine.MAX_TURNS - 1)
        .eliminations(List.of(new TypeChainTypes.TypeChainElimination(other,
            TypeChainTypes.TypeChainEliminationReason.TIMEOUT, 1, 1500, 1)))
        .build();
    var finished = engine.handleAction(alone, current, new TypeChainAction(validContinuation(state, context)), context)
        .state();
    assertEquals(current, finished.winnerId());
    var standings = engine.getResults(finished).standings();
    assertEquals(List.of(current, other), standings.stream().map(GameStanding::playerId).toList());
  }
}

package es.pokemonuniverse.domain.game.engines.typeduel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelAction;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelRoundReason;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, configuración por defecto, parseo, errores de arranque y las
 * estadísticas privadas del abandono por desconexión.
 */
class TypeDuelEngineTest {

  private final TypeDuelEngine engine = new TypeDuelEngine(GoldenManifests.of(TypeDuelEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000).hostId("p1")
        .build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("type-duel", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new TypeDuelEngine(other));
  }

  @Test
  void parsesEachStrictActionVariant() throws IOException {
    assertEquals(new TypeDuelAction.SelectType("fairy"),
        engine.parseAction(json("{\"type\":\"SELECT_TYPE\",\"pokemonType\":\"fairy\"}")));
    var longest = "x".repeat(64);
    assertEquals(new TypeDuelAction.AttemptPokemon(longest),
        engine.parseAction(json("{\"type\":\"ATTEMPT_POKEMON\",\"pokemonId\":\"" + longest + "\"}")));
    assertInstanceOf(TypeDuelAction.Continue.class, engine.parseAction(json("{\"type\":\"CONTINUE\"}")));
    for (var invalid : List.of("{\"type\":\"SELECT_TYPE\",\"pokemonType\":\"shadow\"}",
        "{\"type\":\"SELECT_TYPE\",\"pokemonType\":\"Fire\"}",
        "{\"type\":\"SELECT_TYPE\",\"pokemonType\":\"fire\",\"extra\":1}",
        "{\"type\":\"ATTEMPT_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"ATTEMPT_POKEMON\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"ATTEMPT_POKEMON\",\"pokemonId\":6}", "{\"type\":\"CONTINUE\",\"now\":true}",
        "{\"type\":\"ANSWER\"}", "{\"pokemonType\":\"fire\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsTwoPlayers() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context(1)));
    assertEquals("Se necesitan dos jugadores.", error.getMessage());
  }

  @Test
  void rejectsEachActionWithItsLiteral() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    assertEquals(GamePhase.SELECTING_TYPES, state.phase());
    var spectator = context.players().stream().map(GamePlayer::id).filter(id -> !state.participants().contains(id))
        .findFirst().orElseThrow();
    var duelist = state.participants().getFirst();
    assertEquals("Observas este duelo.",
        engine.handleAction(state, spectator, new TypeDuelAction.SelectType("fire"), context).error());
    assertEquals("No hay ningún resultado que avanzar.",
        engine.handleAction(state, "p1", new TypeDuelAction.Continue(), context).error());
    assertEquals("La carrera no está activa.",
        engine.handleAction(state, duelist, new TypeDuelAction.AttemptPokemon("pikachu"), context).error());
    var locked = engine.handleAction(state, duelist, new TypeDuelAction.SelectType("fire"), context).state();
    assertEquals("Tu tipo ya está bloqueado.",
        engine.handleAction(locked, duelist, new TypeDuelAction.SelectType("water"), context).error());
    var rival = state.participants().get(1);
    var revealed = engine.handleAction(locked, rival, new TypeDuelAction.SelectType("fire"), context).state();
    var search = engine.handleTimeout(revealed, context.withNow(3_000));
    assertEquals(GamePhase.POKEMON_SEARCH, search.phase());
    var pikachu = new TypeDuelAction.AttemptPokemon("pikachu");
    var failed = engine.handleAction(search, duelist, pikachu, context.withNow(3_000));
    assertTrue(failed.accepted());
    var repeated = engine.handleAction(failed.state(), duelist, pikachu, context.withNow(4_000));
    assertFalse(repeated.accepted());
    assertEquals("Ya lo probaste.", repeated.error());
    assertEquals(failed.state(), repeated.state());
    var late = context.withNow(state.roundEndsAt());
    var result = engine.handleAction(state, duelist, new TypeDuelAction.SelectType("fire"), late);
    assertFalse(result.accepted());
    assertEquals("El tiempo ha terminado.", result.error());
  }

  @Test
  void solutionCountIsPublicOnlyDuringTheRevealAndTheSearch() {
    var context = context(2);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    assertNull(engine.getPublicState(state, context).solutionCount());
    var first = engine.handleAction(state, "p1", new TypeDuelAction.SelectType("bug"), context).state();
    assertNull(engine.getPublicState(first, context).solutionCount());
    // Bicho y lucha: solo Heracross en gen 1–2. Se publica cuántos, nunca cuáles.
    var revealed = engine.handleAction(first, "p2", new TypeDuelAction.SelectType("fighting"), context).state();
    assertEquals(GamePhase.TYPE_REVEAL, revealed.phase());
    assertEquals(1, engine.getPublicState(revealed, context).solutionCount());
    var search = engine.handleTimeout(revealed, context.withNow(3_000));
    assertEquals(GamePhase.POKEMON_SEARCH, search.phase());
    assertEquals(1, engine.getPublicState(search, context).solutionCount());
    var won = engine.handleAction(search, "p1", new TypeDuelAction.AttemptPokemon("heracross"), context.withNow(4_000));
    assertEquals(GamePhase.ROUND_RESULTS, won.state().phase());
    assertNull(engine.getPublicState(won.state(), context).solutionCount());
    var impossible = engine.handleAction(
        engine.handleAction(state, "p1", new TypeDuelAction.SelectType("dragon"), context).state(), "p2",
        new TypeDuelAction.SelectType("fairy"), context).state();
    assertEquals(GamePhase.INVALID_COMBINATION, impossible.phase());
    assertNull(engine.getPublicState(impossible, context).solutionCount());
  }

  private static GameContext without(GameContext context, Set<String> absent) {
    return context.withPlayers(context.players().stream()
        .map(player -> absent.contains(player.id()) ? new GamePlayer(player.id(), player.displayName(), false, null)
            : player)
        .toList());
  }

  @Test
  void aLoneDisconnectedDuelistForfeitsToTheRival() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var rival = state.participants().getFirst();
    var absent = state.participants().get(1);
    var result = engine.handlePresenceChange(state, without(context, Set.of(absent)));
    assertEquals(GamePhase.ROUND_RESULTS, result.phase());
    assertEquals(state.completedRounds() + 1, result.completedRounds());
    assertEquals(TypeDuelRoundReason.DISCONNECT_FORFEIT, result.lastRound().reason());
    assertEquals(rival, result.lastRound().winnerId());
    assertEquals(List.of(absent), result.lastRound().disconnectedIds());
    assertEquals(5, result.scores().get(rival));
    assertEquals(0, result.scores().get(absent));
    assertEquals(1, result.playerStats().get(rival).duelsPlayed());
    assertEquals(1, result.playerStats().get(rival).duelsWon());
    assertEquals(1, result.playerStats().get(absent).duelsPlayed());
    assertEquals(0, result.playerStats().get(absent).duelsWon());
  }

  @Test
  void twoDisconnectedDuelistsStillCancelWithoutPoints() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var result = engine.handlePresenceChange(state, without(context, Set.copyOf(state.participants())));
    assertEquals(TypeDuelRoundReason.DISCONNECTED, result.lastRound().reason());
    assertNull(result.lastRound().winnerId());
    assertEquals(state.participants(), result.lastRound().disconnectedIds());
    for (var id : state.participants()) {
      assertEquals(0, result.scores().get(id));
      assertEquals(0, result.playerStats().get(id).duelsPlayed());
    }
  }
}

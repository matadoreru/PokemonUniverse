package es.pokemonuniverse.domain.game.engines.typeduel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.typeduel.TypeDuelTypes.TypeDuelAction;
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

/** Lo que las fixtures doradas no cubren: manifiesto, configuración por defecto, parseo y errores de arranque. */
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
}

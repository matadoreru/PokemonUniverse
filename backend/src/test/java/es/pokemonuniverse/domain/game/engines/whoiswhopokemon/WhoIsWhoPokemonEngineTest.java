package es.pokemonuniverse.domain.game.engines.whoiswhopokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.CursorChannel;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonConfig.WhoIsWhoSecretSelection;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoGuess;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPokemonAction;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoPokemonCard;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoState;
import es.pokemonuniverse.domain.game.engines.whoiswhopokemon.WhoIsWhoPokemonTypes.WhoIsWhoTeam;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, parseo, errores de arranque, ramas inalcanzables y cursores. */
class WhoIsWhoPokemonEngineTest {

  private final WhoIsWhoPokemonEngine engine = new WhoIsWhoPokemonEngine(GoldenManifests.of(WhoIsWhoPokemonEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000)
        .roomCode("GOLD01").build();
  }

  private static WhoIsWhoPokemonConfig config(List<Integer> generations, int boardSize) {
    return new WhoIsWhoPokemonConfig(generations, boardSize, false, 10, 3, 30, WhoIsWhoSecretSelection.RANDOM);
  }

  private WhoIsWhoState started(GameContext context) {
    return engine.start(engine.createInitialState(config(List.of(1), 6), context), context);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("who-is-who-pokemon", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new WhoIsWhoPokemonEngine(other));
  }

  @Test
  void parsesTheStrictDiscriminatedActions() throws IOException {
    var longest = "x".repeat(96);
    assertEquals(new WhoIsWhoPokemonAction.SelectSecret(longest),
        engine.parseAction(json("{\"type\":\"SELECT_SECRET\",\"pokemonId\":\"" + longest + "\"}")));
    assertInstanceOf(WhoIsWhoPokemonAction.ToggleDiscard.class,
        engine.parseAction(json("{\"type\":\"TOGGLE_DISCARD\",\"pokemonId\":\"pikachu\"}")));
    assertInstanceOf(WhoIsWhoPokemonAction.GuessPokemon.class,
        engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\"}")));
    assertInstanceOf(WhoIsWhoPokemonAction.EndTurn.class, engine.parseAction(json("{\"type\":\"END_TURN\"}")));
    for (var invalid : List.of("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"SELECT_SECRET\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"TOGGLE_DISCARD\",\"pokemonId\":25}", "{\"type\":\"TOGGLE_DISCARD\"}",
        "{\"type\":\"END_TURN\",\"pokemonId\":\"pikachu\"}", "{\"type\":\"end_turn\"}", "{\"pokemonId\":\"pikachu\"}",
        "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  /** {@code runner.ts} no captura los errores de createInitialState: estos literales solo se prueban aquí. */
  @Test
  void creationErrorsUseTheServerLiterals() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(config(List.of(1), 5), context(1)));
    assertEquals("Se necesitan al menos 2 jugadores.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.createInitialState(config(List.of(9), 5), context(2)));
    assertEquals("No hay suficientes Pokémon para un tablero de 5.", error.getMessage());
  }

  /** Un intento siempre cambia de turno o termina: el segundo intento del mismo turno solo se alcanza a mano. */
  @Test
  void aTeamCannotGuessTwiceInTheSameTurn() {
    var context = context(2).withNow(2000);
    var state = started(context);
    var guesser = state.teams().get(state.currentTeam()).playerIds().getFirst();
    var previous = new WhoIsWhoGuess(state.currentTeam(), guesser, state.board().getFirst().id(), false, 1500,
        state.turnNumber());
    var repeated = state.toBuilder().guesses(List.of(previous)).build();
    var result = engine.handleAction(repeated, guesser,
        new WhoIsWhoPokemonAction.GuessPokemon(state.board().get(1).id()), context);
    assertFalse(result.accepted());
    assertEquals("Este equipo ya ha intentado adivinar en este turno.", result.error());
    assertEquals(repeated, result.state());
    assertTrue(engine.getPlayerState(repeated, guesser, context).guessUsed());
    assertFalse(engine.getPlayerState(repeated, guesser, context).canGuess());
  }

  @Test
  void sharesCursorsOnlyWithTheOwnTeamDuringATurn() {
    var context = context(3);
    var initial = engine.createInitialState(config(List.of(1), 6), context);
    var blue = initial.teams().blue().playerIds();
    var red = initial.teams().red().playerIds();
    assertEquals(2, blue.size());
    assertEquals(Optional.empty(), engine.getCursorChannel(initial, blue.getFirst()), "GAME_STARTING no comparte");

    var state = engine.start(initial, context);
    var boardIds = state.board().stream().map(WhoIsWhoPokemonCard::id).toList();
    assertEquals(Optional.of(new CursorChannel(blue, boardIds)), engine.getCursorChannel(state, blue.get(1)));
    assertEquals(Optional.of(new CursorChannel(red, boardIds)), engine.getCursorChannel(state, red.getFirst()));
    assertEquals(Optional.empty(), engine.getCursorChannel(state, "spectator"));

    var finished = engine.handlePresenceChange(state, context.withPlayers(List.of(
        new GamePlayer(red.getFirst(), "Red", true, false), new GamePlayer(blue.getFirst(), "Blue"))));
    assertEquals(GamePhase.GAME_RESULTS, finished.phase());
    assertEquals(WhoIsWhoTeam.BLUE, finished.winnerTeam());
    assertEquals(Optional.empty(), engine.getCursorChannel(finished, blue.getFirst()));
  }

  /** Ningún equipo elige: el plazo sortea un secreto por equipo (BLUE y luego RED), un random() cada uno. */
  @Test
  void selectionTimeoutDrawsOneSecretPerTeamWithoutOne() {
    var draws = new AtomicInteger();
    var source = new Mulberry32(7);
    var context = GameContext.builder(GoldenCatalogs.load("gen1-2"), () -> {
      draws.incrementAndGet();
      return source.getAsDouble();
    }).players(List.of(new GamePlayer("p1", "Ana"), new GamePlayer("p2", "Bruno"))).now(1000).build();
    var config = new WhoIsWhoPokemonConfig(List.of(1), 6, false, 10, 3, 20, WhoIsWhoSecretSelection.PLAYER_CHOICE);
    var state = engine.start(engine.createInitialState(config, context), context);
    assertEquals(6 + 2, draws.get(), "tablero y equipos; sin secretos aleatorios");
    assertEquals(21_000L, state.roundEndsAt());
    assertEquals(state, engine.handleTimeout(state, context.withNow(20_999)));
    var drawn = engine.handleTimeout(state, context.withNow(21_000));
    assertEquals(6 + 2 + 2, draws.get());
    assertTrue(drawn.teams().allSecretsReady());
    assertEquals(21_000L, drawn.roundStartedAt());
    assertEquals(31_000L, drawn.roundEndsAt());
    assertEquals(WhoIsWhoTeam.BLUE, drawn.currentTeam());
  }

  @Test
  void resultsAreUnavailableBeforeTheGameFinishes() {
    var state = started(context(2));
    assertEquals(GamePhase.TURN_ACTIVE, state.phase());
    var error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }
}

package es.pokemonuniverse.domain.game.engines.whoami;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIAction;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIAnswer;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIAnswerEntry;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIHistoryEntry;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIPlayerState;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIPokemon;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIPublicState;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIResultEntry;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIState;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmITurnStep;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

/**
 * Turnos, plazos, presencia, aciertos y privacidad del motor de ¿Quién soy?, con el catálogo dorado, un azar fijo y un
 * reloj controlado. La partida empieza a {@code now = 1000}; los turnos siguen el orden de {@code playerIds}.
 */
class WhoAmIEngineTest {

  private static final InMemoryPokemonCatalog CATALOG = GoldenCatalogs.load("gen1-2");
  /** El mapper del cable ({@code NON_NULL}, como {@code application.yml}). */
  private static final ObjectMapper WIRE =
      ObjectMapper.create(Map.of("micronaut.serde.serialization.inclusion", "NON_NULL"));

  private final WhoAmIEngine engine = new WhoAmIEngine(GoldenManifests.of(WhoAmIEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static String wire(Object value) {
    try {
      return WIRE.writeValueAsString(value);
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  private static List<GamePlayer> players(int count) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= count; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return list;
  }

  private static GameContext context(int players, long seed) {
    return GameContext.builder(CATALOG, new Mulberry32(seed)).players(players(players)).now(1_000).build();
  }

  private static WhoAmIConfig config(int maxLaps) {
    return new WhoAmIConfig(List.of(1, 2), maxLaps, 45, 20);
  }

  private WhoAmIState started(WhoAmIConfig config, GameContext context) {
    return engine.start(engine.createInitialState(config, context), context);
  }

  private GameActionResult<WhoAmIState> act(WhoAmIState state, String playerId, WhoAmIAction action,
      GameContext context, long now) {
    return engine.handleAction(state, playerId, action, context.withNow(now));
  }

  private WhoAmIState accepted(WhoAmIState state, String playerId, WhoAmIAction action, GameContext context,
      long now) {
    var result = act(state, playerId, action, context, now);
    assertTrue(result.accepted(), () -> "rechazada: " + result.error());
    return result.state();
  }

  private void rejected(WhoAmIState state, String playerId, WhoAmIAction action, GameContext context, long now,
      String error) {
    var result = act(state, playerId, action, context, now);
    assertFalse(result.accepted());
    assertEquals(error, result.error());
    assertSame(state, result.state());
  }

  private static WhoAmIAction ask(String text) {
    return new WhoAmIAction.Ask(text);
  }

  private static WhoAmIAction answer(WhoAmIAnswer value) {
    return new WhoAmIAction.Answer(value);
  }

  private static WhoAmIAction guess(String pokemonId) {
    return new WhoAmIAction.GuessSelf(pokemonId);
  }

  private static WhoAmIAction pass() {
    return new WhoAmIAction.Pass();
  }

  private static String own(WhoAmIState state, String playerId) {
    return state.assignments().get(playerId).id();
  }

  /** Un Pokémon de la partida que no tiene nadie: los fallos nunca nombran el Pokémon de otro jugador. */
  private static Pokemon unassigned(WhoAmIState state, int skip) {
    var taken = state.assignments().values().stream().map(WhoAmIPokemon::id).toList();
    return WhoAmIRules.pool(state.config(), CATALOG).stream().filter(p -> !taken.contains(p.id())).skip(skip)
        .findFirst().orElseThrow();
  }

  private WhoAmIPublicState view(WhoAmIState state, GameContext context) {
    return engine.getPublicState(state, context);
  }

  private WhoAmIPlayerState player(WhoAmIState state, String playerId, GameContext context) {
    return (WhoAmIPlayerState) engine.getPlayerState(state, playerId, context);
  }

  private static String turnPlayer(WhoAmIState state) {
    return state.playerIds().get(state.turnIndex());
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("who-am-i", engine.manifest().id());
    assertEquals("¿Quién soy?", engine.manifest().name());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
    assertThrows(IllegalArgumentException.class, () -> new WhoAmIEngine(GoldenManifests.of("higher-lower")));
  }

  @Test
  void shortDisconnectsHaveAPresenceGrace() {
    // Un microcorte (cambiar de app) no pasa el turno ni acaba la partida: la sala espera 8 s antes de avisar al motor.
    assertEquals(Integer.valueOf(8_000), engine.manifest().presenceGraceMs());
  }

  @Test
  void needsTwoPlayers() throws IOException {
    assertEquals(2, engine.manifest().minPlayers());
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(config(10), context(1, 3)));
    assertEquals("Se necesitan al menos 2 jugadores.", error.getMessage());
    // Disponibilidad: un Pokémon distinto por jugador.
    var gen1 = new WhoAmIConfig(List.of(1), 10, 45, 20);
    int available = WhoAmIRules.pool(gen1, CATALOG).size();
    var crowded = context(available + 1, 3);
    var message = "Solo hay " + available + " Pokémon en esas generaciones.";
    assertEquals(Optional.of(message), engine.checkAvailability(gen1, crowded));
    assertEquals(Optional.empty(), engine.checkAvailability(gen1, context(available, 3)));
    error = assertThrows(EngineException.class, () -> engine.createInitialState(gen1, crowded));
    assertEquals(message, error.getMessage());
    // Los literales de la acción cruda los da parseAction (en las fixtures detendrían el escenario).
    var parse = assertThrows(ConfigValidationException.class,
        () -> engine.parseAction(json("{\"type\":\"ASK_QUESTION\",\"text\":\"   \"}")));
    assertEquals("Escribe una pregunta antes de enviarla.", parse.getMessage());
    parse = assertThrows(ConfigValidationException.class,
        () -> engine.parseAction(json("{\"type\":\"ASK_QUESTION\",\"text\":\"" + "a".repeat(121) + "\"}")));
    assertEquals("La pregunta no puede superar 120 caracteres.", parse.getMessage());
    parse = assertThrows(ConfigValidationException.class, () -> engine.parseAction(json("{\"type\":\"GUESS_SELF\"}")));
    assertEquals("Acción de ¿Quién soy? no válida.", parse.getMessage());
  }

  @Test
  void startDealsAndOpensTheFirstTurn() {
    var context = context(3, 11);
    var initial = engine.createInitialState(config(10), context);
    assertEquals(GamePhase.GAME_STARTING, initial.phase());
    assertEquals(Map.of(), initial.assignments());
    var state = engine.start(initial, context);
    assertEquals(GamePhase.TURN_ACTIVE, state.phase());
    assertEquals(3, state.assignments().size());
    assertEquals(3, state.assignments().values().stream().map(WhoAmIPokemon::id).distinct().count());
    assertEquals("p1", turnPlayer(state));
    assertEquals(1, state.lap());
    assertEquals(WhoAmITurnStep.ASKING, state.turnStep());
    assertEquals(1_000L + 45_000L, view(state, context).turnEndsAt());
    assertEquals(1_000L + 45_000L, engine.getLifecycle(state).nextDeadline());
    assertEquals(Map.of("p1", 0, "p2", 0, "p3", 0), view(state, context).scores());
    assertEquals(List.of("p1", "p2", "p3"), List.copyOf(view(state, context).history().keySet()));
  }

  @Test
  void askAnswerDecideFlow() {
    var context = context(3, 11);
    var state = started(config(10), context);
    var epochAsking = engine.getLifecycle(state).actionEpoch();
    state = accepted(state, "p1", ask("¿Soy de tipo fuego?"), context, 2_000);
    var publicState = view(state, context);
    assertEquals(WhoAmITurnStep.ANSWERING, publicState.turnStep());
    assertEquals(2_000L + 20_000L, publicState.turnEndsAt());
    assertEquals("¿Soy de tipo fuego?", publicState.currentQuestion().text());
    assertEquals(1, publicState.questionsAsked().get("p1"));
    assertEquals(List.of(), publicState.history().get("p1"));
    var epochAnswering = engine.getLifecycle(state).actionEpoch();
    assertNotEquals(epochAsking, epochAnswering);
    assertTrue(player(state, "p2", context).canAnswer());
    assertFalse(player(state, "p1", context).canAnswer());

    state = accepted(state, "p2", answer(WhoAmIAnswer.YES), context, 3_000);
    // Una respuesta no cambia la época: la del siguiente que responde sigue valiendo.
    assertEquals(epochAnswering, engine.getLifecycle(state).actionEpoch());
    assertEquals(WhoAmITurnStep.ANSWERING, state.turnStep());
    assertEquals(List.of("p2"), view(state, context).currentQuestion().answeredPlayerIds());
    assertEquals(WhoAmIAnswer.YES, player(state, "p2", context).ownAnswer());
    assertFalse(player(state, "p2", context).canAnswer());
    assertTrue(player(state, "p3", context).canAnswer());

    state = accepted(state, "p3", answer(WhoAmIAnswer.PARTLY), context, 4_000);
    publicState = view(state, context);
    assertEquals(WhoAmITurnStep.DECIDING, publicState.turnStep());
    assertEquals(4_000L + WhoAmIRules.DECIDE_MS, publicState.turnEndsAt());
    assertEquals(List.of(new WhoAmIAnswerEntry("p2", WhoAmIAnswer.YES),
        new WhoAmIAnswerEntry("p3", WhoAmIAnswer.PARTLY)), publicState.currentQuestion().answers());
    var turn = player(state, "p1", context);
    assertTrue(turn.canPass());
    assertTrue(turn.canGuess());
    assertFalse(turn.canAsk());

    state = accepted(state, "p1", pass(), context, 5_000);
    publicState = view(state, context);
    assertEquals("p2", publicState.turnPlayerId());
    assertEquals(WhoAmITurnStep.ASKING, publicState.turnStep());
    assertNull(publicState.currentQuestion());
    assertEquals(5_000L + 45_000L, publicState.turnEndsAt());
    assertEquals(List.of(new WhoAmIHistoryEntry.Question("¿Soy de tipo fuego?", List.of(
        new WhoAmIAnswerEntry("p2", WhoAmIAnswer.YES), new WhoAmIAnswerEntry("p3", WhoAmIAnswer.PARTLY)))),
        publicState.history().get("p1"));
    assertTrue(player(state, "p2", context).canAsk());
  }

  @Test
  void answersStayHiddenWhileAnswering() {
    var context = context(4, 11);
    var state = started(config(10), context);
    state = accepted(state, "p1", ask("¿Tengo alas?"), context, 2_000);
    state = accepted(state, "p2", answer(WhoAmIAnswer.NO), context, 3_000);
    state = accepted(state, "p3", answer(WhoAmIAnswer.YES), context, 4_000);
    // Faltan respuestas: se sabe quién respondió, pero no qué, ni en el estado público ni en el cable.
    var publicState = view(state, context);
    assertEquals(WhoAmITurnStep.ANSWERING, publicState.turnStep());
    assertEquals(List.of(), publicState.currentQuestion().answers());
    assertEquals(List.of("p2", "p3"), publicState.currentQuestion().answeredPlayerIds());
    assertFalse(wire(publicState).contains("\"answer\":"));
    // La respuesta propia sí llega a quien respondió.
    assertEquals(WhoAmIAnswer.NO, player(state, "p2", context).ownAnswer());

    state = accepted(state, "p4", answer(WhoAmIAnswer.UNKNOWN), context, 5_000);
    publicState = view(state, context);
    assertEquals(WhoAmITurnStep.DECIDING, publicState.turnStep());
    assertEquals(List.of(new WhoAmIAnswerEntry("p2", WhoAmIAnswer.NO), new WhoAmIAnswerEntry("p3", WhoAmIAnswer.YES),
        new WhoAmIAnswerEntry("p4", WhoAmIAnswer.UNKNOWN)), publicState.currentQuestion().answers());
  }

  @Test
  void timeoutsAdvanceEachStep() {
    var context = context(3, 12);
    var state = started(config(10), context);
    assertSame(state, engine.handleTimeout(state, context.withNow(45_999)));
    // ASKING vence: el turno pasa sin pregunta.
    state = engine.handleTimeout(state, context.withNow(46_000));
    assertEquals("p2", turnPlayer(state));
    assertEquals(WhoAmITurnStep.ASKING, state.turnStep());
    assertEquals(List.of(), state.history().get("p1"));
    // ANSWERING vence con respuestas parciales: pasa a DECIDING.
    state = accepted(state, "p2", ask("¿Tengo alas?"), context, 47_000);
    state = accepted(state, "p1", answer(WhoAmIAnswer.NO), context, 48_000);
    assertSame(state, engine.handleTimeout(state, context.withNow(66_999)));
    state = engine.handleTimeout(state, context.withNow(67_000));
    assertEquals(WhoAmITurnStep.DECIDING, state.turnStep());
    assertEquals(67_000L + WhoAmIRules.DECIDE_MS, state.roundEndsAt());
    assertEquals(1, state.currentQuestion().answers().size());
    // DECIDING vence: pasa y la pregunta entra en el historial con la respuesta que tenía.
    state = engine.handleTimeout(state, context.withNow(87_000));
    assertEquals("p3", turnPlayer(state));
    assertNull(state.currentQuestion());
    assertEquals(List.of(new WhoAmIHistoryEntry.Question("¿Tengo alas?",
        List.of(new WhoAmIAnswerEntry("p1", WhoAmIAnswer.NO)))), state.history().get("p2"));
    // Tras el último índice vuelve al primero y sube la vuelta.
    state = engine.handleTimeout(state, context.withNow(132_000));
    assertEquals("p1", turnPlayer(state));
    assertEquals(2, state.lap());
  }

  @Test
  void rejectsOutOfTurnAndInvalidActions() {
    var context = context(3, 13);
    var gen1 = new WhoAmIConfig(List.of(1), 10, 45, 20);
    var initial = engine.createInitialState(gen1, context);
    rejected(initial, "p1", ask("¿Antes de empezar?"), context, 900, "No es tu turno.");
    rejected(initial, "p2", answer(WhoAmIAnswer.YES), context, 900, "No hay ninguna pregunta que responder.");
    var state = engine.start(initial, context);

    rejected(state, "p9", ask("¿Soy grande?"), context, 2_000, "Estás observando esta partida.");
    rejected(state, "p9", answer(WhoAmIAnswer.YES), context, 2_000, "Estás observando esta partida.");
    rejected(state, "p2", ask("¿Soy grande?"), context, 2_000, "No es tu turno.");
    rejected(state, "p2", guess(own(state, "p2")), context, 2_000, "No es tu turno.");
    rejected(state, "p2", pass(), context, 2_000, "No es tu turno.");
    rejected(state, "p2", answer(WhoAmIAnswer.YES), context, 2_000, "No hay ninguna pregunta que responder.");
    rejected(state, "p1", pass(), context, 2_000, "Solo puedes pasar después de las respuestas.");
    rejected(state, "p1", guess("no-existe"), context, 2_000, "Ese Pokémon no está en las generaciones de la partida.");
    var gen2 = CATALOG.forGenerations(List.of(2), false).getFirst();
    rejected(state, "p1", guess(gen2.id()), context, 2_000, "Ese Pokémon no está en las generaciones de la partida.");

    state = accepted(state, "p1", ask("¿Soy grande?"), context, 3_000);
    rejected(state, "p1", ask("¿Otra?"), context, 3_100, "Ahora no toca preguntar.");
    rejected(state, "p1", answer(WhoAmIAnswer.YES), context, 3_100, "No puedes responder tu propia pregunta.");
    rejected(state, "p1", guess(own(state, "p1")), context, 3_100, "Ahora no puedes adivinar.");
    rejected(state, "p1", pass(), context, 3_100, "Solo puedes pasar después de las respuestas.");
    rejected(state, "p3", answer(WhoAmIAnswer.NO), offline(context, "p3"), 3_100, "Estás observando esta partida.");
    state = accepted(state, "p2", answer(WhoAmIAnswer.UNKNOWN), context, 3_200);
    rejected(state, "p2", answer(WhoAmIAnswer.NO), context, 3_300, "Ya has respondido.");
    state = accepted(state, "p3", answer(WhoAmIAnswer.NO), context, 3_400);
    // En DECIDING la pregunta sigue abierta: quien ya respondió lo oye, y no se puede volver a preguntar.
    rejected(state, "p2", answer(WhoAmIAnswer.NO), context, 3_500, "Ya has respondido.");
    rejected(state, "p1", ask("¿Otra?"), context, 3_500, "Ahora no toca preguntar.");
  }

  @Test
  void rejectsGuessingAnotherPlayersPokemon() {
    var context = context(3, 23);
    var state = started(config(10), context);
    // En ASKING: rechazo sin historial, sin fallo y con el mismo turno y paso.
    rejected(state, "p1", guess(own(state, "p2")), context, 2_000, "Ese Pokémon lo tiene otro jugador.");
    // En DECIDING, igual.
    state = accepted(state, "p1", ask("¿Soy grande?"), context, 3_000);
    state = accepted(state, "p2", answer(WhoAmIAnswer.NO), context, 3_500);
    state = accepted(state, "p3", answer(WhoAmIAnswer.NO), context, 4_000);
    rejected(state, "p1", guess(own(state, "p3")), context, 5_000, "Ese Pokémon lo tiene otro jugador.");
    assertEquals(WhoAmITurnStep.DECIDING, state.turnStep());
    assertEquals("p1", turnPlayer(state));
    assertEquals(List.of(), state.history().get("p1"));
    assertEquals(0, state.wrongGuesses().get("p1"));
    // Las comprobaciones de paso y de generaciones van antes.
    var answering = accepted(engine.handleTimeout(state, context.withNow(25_000)), "p2", ask("¿Vuelo?"), context, 26_000);
    rejected(answering, "p2", guess(own(answering, "p1")), context, 26_500, "Ahora no puedes adivinar.");
    // El propio sigue siendo un acierto.
    state = accepted(state, "p1", guess(own(state, "p1")), context, 6_000);
    assertEquals(List.of("p1"), state.solvedPlayerIds());
  }

  @Test
  void wrongGuessEndsTheTurnAndGoesToHistory() {
    var context = context(3, 14);
    var state = started(config(10), context);
    state = accepted(state, "p1", ask("¿Soy legendario?"), context, 2_000);
    state = accepted(state, "p2", answer(WhoAmIAnswer.NO), context, 2_500);
    state = accepted(state, "p3", answer(WhoAmIAnswer.NO), context, 3_000);
    var wrong = unassigned(state, 0);
    state = accepted(state, "p1", guess(wrong.id()), context, 4_000);
    assertEquals("p2", turnPlayer(state));
    // Primero la pregunta y después el fallo: orden cronológico.
    var history = state.history().get("p1");
    assertEquals(2, history.size());
    assertEquals("QUESTION", history.get(0).kind());
    var miss = (WhoAmIHistoryEntry.Guess) history.get(1);
    assertEquals(wrong.id(), miss.pokemon().id());
    assertEquals(wrong.name(), miss.pokemon().name());
    assertEquals(1, state.wrongGuesses().get("p1"));
    assertEquals(List.of(), state.solvedPlayerIds());
    assertEquals(0, state.scores().get("p1"));

    // Un fallo directo en ASKING también acaba el turno.
    var other = unassigned(state, 1);
    state = accepted(state, "p2", guess(other.id()), context, 5_000);
    assertEquals("p3", turnPlayer(state));
    assertEquals(List.of(new WhoAmIHistoryEntry.Guess(new WhoAmIPokemon(other.id(), other.name(), other.sprite(),
        other.nationalDexNumber(), other.types()))), state.history().get("p2"));
    // El historial sale en el cable con su discriminante.
    var wire = wire(view(state, context));
    assertTrue(wire.contains("{\"kind\":\"QUESTION\",\"text\":\"¿Soy legendario?\",\"answers\":["), wire);
    assertTrue(wire.contains("{\"kind\":\"GUESS\",\"pokemon\":{\"id\":\"" + other.id() + "\""), wire);
  }

  @Test
  void correctGuessScoresAndResolves() {
    var context = context(3, 15);
    var state = started(config(10), context);
    state = accepted(state, "p1", guess(own(state, "p1")), context, 2_000);
    assertEquals(List.of("p1"), state.solvedPlayerIds());
    assertEquals(WhoAmIRules.solvePoints(0, 1), state.scores().get("p1"));
    assertEquals(13, state.scores().get("p1"));
    assertEquals(List.of(), state.history().get("p1"));
    assertEquals(state.assignments().get("p1"), player(state, "p1", context).self());
    assertEquals("p2", turnPlayer(state));

    // Acierto en DECIDING tras una pregunta: 10 − 1 + 2.
    state = accepted(state, "p2", ask("¿Soy azul?"), context, 3_000);
    state = accepted(state, "p1", answer(WhoAmIAnswer.YES), context, 3_500);
    state = accepted(state, "p3", answer(WhoAmIAnswer.YES), context, 4_000);
    state = accepted(state, "p2", guess(own(state, "p2")), context, 5_000);
    assertEquals(List.of("p1", "p2"), state.solvedPlayerIds());
    assertEquals(11, state.scores().get("p2"));
    assertEquals(1, state.history().get("p2").size());
    assertEquals("p3", turnPlayer(state));
  }

  @Test
  void solvedPlayerIsSkippedButStillAnswers() {
    var context = context(3, 16);
    var state = started(config(10), context);
    state = accepted(state, "p1", guess(own(state, "p1")), context, 2_000);
    state = accepted(state, "p2", ask("¿Soy rápido?"), context, 3_000);
    assertTrue(player(state, "p1", context).canAnswer());
    state = accepted(state, "p1", answer(WhoAmIAnswer.PARTLY), context, 3_500);
    assertEquals(WhoAmITurnStep.ANSWERING, state.turnStep());
    state = accepted(state, "p3", answer(WhoAmIAnswer.YES), context, 4_000);
    assertEquals(WhoAmITurnStep.DECIDING, state.turnStep());
    state = accepted(state, "p2", pass(), context, 5_000);
    assertEquals("p3", turnPlayer(state));
    // p3 deja vencer su turno: p1 ya acertó, así que vuelve p2 en la vuelta 2.
    state = engine.handleTimeout(state, context.withNow(50_000));
    assertEquals("p2", turnPlayer(state));
    assertEquals(2, state.lap());
    assertFalse(player(state, "p1", context).canAsk());
    assertFalse(player(state, "p1", context).canGuess());
  }

  @Test
  void turnPassesWhenTheTurnPlayerDisconnects() {
    var context = context(3, 17);
    var state = started(config(10), context);
    // En ASKING.
    var away = offline(context, "p1");
    state = engine.handlePresenceChange(state, away.withNow(2_000));
    assertEquals("p2", turnPlayer(state));
    assertEquals(2_000L + 45_000L, state.roundEndsAt());
    // En ANSWERING: la pregunta entra en el historial con las respuestas que tenía.
    state = accepted(state, "p2", ask("¿Vivo en el agua?"), context, 3_000);
    state = accepted(state, "p3", answer(WhoAmIAnswer.YES), context, 3_500);
    state = engine.handlePresenceChange(state, offline(context, "p2").withNow(4_000));
    assertEquals("p3", turnPlayer(state));
    assertNull(state.currentQuestion());
    assertEquals(List.of(new WhoAmIHistoryEntry.Question("¿Vivo en el agua?",
        List.of(new WhoAmIAnswerEntry("p3", WhoAmIAnswer.YES)))), state.history().get("p2"));
    // En DECIDING.
    state = accepted(state, "p3", ask("¿Soy pequeño?"), context, 5_000);
    state = accepted(state, "p1", answer(WhoAmIAnswer.NO), context, 5_500);
    state = accepted(state, "p2", answer(WhoAmIAnswer.NO), context, 6_000);
    assertEquals(WhoAmITurnStep.DECIDING, state.turnStep());
    state = engine.handlePresenceChange(state, offline(context, "p3").withNow(7_000));
    assertEquals("p1", turnPlayer(state));
    assertEquals(2, state.lap());
    assertEquals(1, state.history().get("p3").size());
    // Un cambio de presencia que no afecta al turno no cambia nada.
    assertSame(state, engine.handlePresenceChange(state, offline(context, "p2").withNow(8_000)));
    // El desconectado sigue siendo PLAYER, sin permisos.
    var view = player(state, "p1", offline(context, "p1"));
    assertEquals("PLAYER", view.role());
    assertFalse(view.canAsk());
    assertFalse(view.canGuess());
  }

  private static GameContext offline(GameContext context, String playerId) {
    var list = new ArrayList<GamePlayer>();
    for (var player : context.players()) {
      list.add(player.id().equals(playerId) ? new GamePlayer(player.id(), player.displayName(), false, null) : player);
    }
    return context.withPlayers(list);
  }

  @Test
  void answeringClosesWhenNobodyIsLeftToAnswer() {
    var context = context(2, 18);
    var state = started(config(10), context);
    state = accepted(state, "p1", ask("¿Soy de tipo planta?"), context, 2_000);
    assertEquals(WhoAmITurnStep.ANSWERING, state.turnStep());
    // El único que responde se desconecta: se pasa a DECIDING enseguida.
    var away = offline(context, "p2");
    state = engine.handlePresenceChange(state, away.withNow(3_000));
    assertEquals(WhoAmITurnStep.DECIDING, state.turnStep());
    assertEquals(3_000L + WhoAmIRules.DECIDE_MS, state.roundEndsAt());
    assertEquals(List.of(), state.currentQuestion().answers());
    // Con nadie que deba responder, la pregunta va directa a DECIDING.
    state = accepted(state, "p1", pass(), away, 4_000);
    assertEquals("p1", turnPlayer(state));
    assertEquals(2, state.lap());
    state = accepted(state, "p1", ask("¿Soy de tipo agua?"), away, 5_000);
    assertEquals(WhoAmITurnStep.DECIDING, state.turnStep());
    assertEquals("¿Soy de tipo agua?", state.currentQuestion().text());
    assertEquals(5_000L + WhoAmIRules.DECIDE_MS, state.roundEndsAt());
  }

  @Test
  void gameEndsWhenAllSolvedOrLapsRunOut() {
    // Todos aciertan.
    var context = context(2, 19);
    var state = started(config(10), context);
    state = accepted(state, "p1", guess(own(state, "p1")), context, 2_000);
    state = accepted(state, "p2", guess(own(state, "p2")), context, 3_000);
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    assertTrue(engine.isFinished(state));
    assertNull(state.turnStep());
    assertNull(state.roundEndsAt());
    assertNull(engine.getLifecycle(state).nextDeadline());
    var stats = engine.getResults(state).standings().getFirst().stats();
    assertEquals(1, stats.get("gamesPlayed"));
    assertEquals(1, stats.get("solved"));

    // Se acaban las vueltas: 3 vueltas de 2 jugadores, todas vencidas.
    state = started(config(3), context);
    long now = 1_000;
    for (int turn = 0; turn < 6; turn++) {
      assertEquals(GamePhase.TURN_ACTIVE, state.phase());
      now += 45_000;
      state = engine.handleTimeout(state, context.withNow(now));
    }
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    assertEquals(List.of(0, 0), engine.getResults(state).standings().stream().map(GameStanding::points).toList());

    // Todos los que quedan se van: nadie es elegible y termina.
    state = started(config(10), context);
    state = engine.handlePresenceChange(state, offline(offline(context, "p1"), "p2").withNow(2_000));
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
  }

  /** Las cadenas exactas (entre comillas) por las que se reconocería un Pokémon en el JSON. */
  private static List<String> traces(WhoAmIPokemon pokemon) {
    return List.of("\"" + pokemon.id() + "\"", "\"" + pokemon.name() + "\"", "\"" + pokemon.sprite() + "\"");
  }

  private void assertPrivate(WhoAmIState state, GameContext context, List<String> viewers) {
    var publicWire = wire(view(state, context));
    for (var playerId : state.playerIds()) {
      var pokemon = state.assignments().get(playerId);
      if (state.phase() != GamePhase.GAME_RESULTS) {
        for (var trace : traces(pokemon)) assertFalse(publicWire.contains(trace), publicWire);
      }
    }
    for (var viewer : viewers) {
      var playerWire = wire(player(state, viewer, context));
      boolean spectator = !state.playerIds().contains(viewer);
      for (var playerId : state.playerIds()) {
        var traces = traces(state.assignments().get(playerId));
        boolean visible = spectator || !playerId.equals(viewer) || state.solvedPlayerIds().contains(playerId);
        for (var trace : traces) assertEquals(visible, playerWire.contains(trace), viewer + " " + playerWire);
      }
    }
  }

  @Test
  void projectionsNeverShowOwnPokemonBeforeSolving() {
    var context = context(3, 20);
    var state = started(config(10), context);
    // p9 entra en la sala después de empezar: es espectador (como en la sala, con {@code active = false}).
    var players = new ArrayList<>(context.players());
    players.add(new GamePlayer("p9", "Spectator", true, false));
    context = context.withPlayers(players);
    var viewers = List.of("p1", "p2", "p3", "p9");
    assertEquals(List.of("p1", "p2", "p3"), state.playerIds());
    assertPrivate(state, context, viewers);
    state = accepted(state, "p1", ask("¿Soy de tipo eléctrico?"), context, 2_000);
    assertPrivate(state, context, viewers);
    state = accepted(state, "p2", answer(WhoAmIAnswer.YES), context, 2_500);
    assertPrivate(state, context, viewers);
    state = accepted(state, "p3", answer(WhoAmIAnswer.UNKNOWN), context, 3_000);
    assertPrivate(state, context, viewers);
    state = accepted(state, "p1", guess(unassigned(state, 0).id()), context, 3_500);
    assertPrivate(state, context, viewers);
    state = accepted(state, "p2", guess(own(state, "p2")), context, 4_000);
    assertPrivate(state, context, viewers);
    // p3 pasa a no necesario a mitad de partida: sigue siendo PLAYER y sin su Pokémon.
    var away = offline(context, "p3");
    state = engine.handlePresenceChange(state, away.withNow(5_000));
    assertPrivate(state, away, viewers);
    var p3 = player(state, "p3", away);
    assertEquals("PLAYER", p3.role());
    assertNull(p3.self());
    assertFalse(p3.others().containsKey("p3"));
    state = accepted(state, "p1", guess(own(state, "p1")), away, 6_000);
    // Fin de partida (p3 no está y los demás han acertado): el público lo revela todo.
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    var publicWire = wire(view(state, away));
    for (var trace : traces(state.assignments().get("p3"))) assertTrue(publicWire.contains(trace));
    assertPrivate(state, away, viewers);
  }

  @Test
  void spectatorCannotActButSeesEveryPokemon() {
    var context = context(3, 21);
    var state = started(config(10), context);
    var spectator = player(state, "p9", context);
    assertEquals("SPECTATOR", spectator.role());
    assertEquals(state.assignments(), spectator.others());
    assertEquals(List.of("p1", "p2", "p3"), List.copyOf(spectator.others().keySet()));
    assertNull(spectator.self());
    assertFalse(spectator.canAsk() || spectator.canAnswer() || spectator.canGuess() || spectator.canPass());
    rejected(state, "p9", guess(own(state, "p1")), context, 2_000, "Estás observando esta partida.");
    rejected(state, "p9", pass(), context, 2_000, "Estás observando esta partida.");
    var p2 = player(state, "p2", context);
    assertEquals("PLAYER", p2.role());
    assertEquals(List.of("p1", "p3"), List.copyOf(p2.others().keySet()));
  }

  @Test
  void finalResultsRankByPointsThenFewerQuestions() {
    var context = context(3, 22);
    var state = started(config(10), context);
    // p1 acierta directo: 10 + 3. p2 tras una pregunta: 9 + 2. p3 directo, tercero: 10 + 1.
    state = accepted(state, "p1", guess(own(state, "p1")), context, 2_000);
    state = accepted(state, "p2", ask("¿Soy un fósil?"), context, 3_000);
    state = accepted(state, "p1", answer(WhoAmIAnswer.NO), context, 3_500);
    state = accepted(state, "p3", answer(WhoAmIAnswer.NO), context, 4_000);
    state = accepted(state, "p2", guess(own(state, "p2")), context, 5_000);
    state = accepted(state, "p3", guess(own(state, "p3")), context, 6_000);
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    var results = engine.getResults(state);
    assertEquals("p1", results.winnerId());
    assertEquals(List.of("p1", "p3", "p2"), results.standings().stream().map(GameStanding::playerId).toList());
    assertEquals(List.of(13, 11, 11), results.standings().stream().map(GameStanding::points).toList());
    assertEquals(List.of(1, 2, 3), results.standings().stream().map(GameStanding::position).toList());
    Function<String, Map<String, Number>> statsOf = id -> results.standings().stream()
        .filter(s -> s.playerId().equals(id)).findFirst().orElseThrow().stats();
    assertEquals(Map.of("gamesPlayed", 1, "solved", 1, "questionsAsked", 0, "wrongGuesses", 0, "firstSolves", 1,
        "pointsFromRounds", 13), statsOf.apply("p1"));
    assertEquals(1, statsOf.apply("p2").get("questionsAsked"));
    assertEquals(0, statsOf.apply("p2").get("firstSolves"));
    var publicResults = view(state, context).results();
    assertEquals(List.of(
        new WhoAmIResultEntry("p1", state.assignments().get("p1"), true, 0, 13, 1),
        new WhoAmIResultEntry("p3", state.assignments().get("p3"), true, 0, 11, 2),
        new WhoAmIResultEntry("p2", state.assignments().get("p2"), true, 1, 11, 3)), publicResults);
    assertNull(view(state, context).turnPlayerId());
    assertNull(view(state, context).currentQuestion());
  }
}

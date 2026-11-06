package es.pokemonuniverse.domain.game.engines.higherlower;

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
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerAction;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerChoice;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, configuración por defecto y bordes del parseo. */
class HigherLowerEngineTest {

  private final HigherLowerEngine engine = new HigherLowerEngine(GoldenManifests.of(HigherLowerEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("higher-lower", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("type-chain");
    assertThrows(IllegalArgumentException.class, () -> new HigherLowerEngine(other));
  }

  @Test
  void acceptsIntegralDoublesAndRejectsFractions() throws IOException {
    var base = "\"generations\":[1],\"categories\":[\"HP\"],\"showPreviousValue\":true,"
        + "\"answerVisibility\":\"LIVE\",\"difficulty\":\"NORMAL\",";
    var config = engine.parseConfig(json("{" + base + "\"roundSeconds\":10.0,\"rounds\":1.0}"));
    assertEquals(10, config.roundSeconds());
    assertEquals(1, config.rounds());
    assertThrows(ConfigValidationException.class,
        () -> engine.parseConfig(json("{" + base + "\"roundSeconds\":10.5,\"rounds\":1}")));
    assertThrows(ConfigValidationException.class,
        () -> engine.parseConfig(json("{" + base + "\"roundSeconds\":20,\"rounds\":null}")));
  }

  @Test
  void hidesAnswersUntilRevealByDefaultAndRejectsTheOldRealtimeValue() throws IOException {
    assertEquals(HigherLowerConfig.HigherLowerAnswerVisibility.REVEAL, engine.defaultConfig().answerVisibility());
    var base = "{\"generations\":[1],\"categories\":[\"HP\"],\"showPreviousValue\":true,\"difficulty\":\"NORMAL\","
        + "\"roundSeconds\":10,\"rounds\":1,\"answerVisibility\":";
    assertEquals(HigherLowerConfig.HigherLowerAnswerVisibility.LIVE,
        engine.parseConfig(json(base + "\"LIVE\"}")).answerVisibility());
    assertThrows(ConfigValidationException.class, () -> engine.parseConfig(json(base + "\"REALTIME\"}")));
  }

  @Test
  void grantsTheSpeedBonusOnlyInTheFirstHalfOfTheRound() {
    assertEquals(1, HigherLowerRules.speedBonus(10_999, 1_000, 20));
    assertEquals(0, HigherLowerRules.speedBonus(11_000, 1_000, 20));
  }

  @Test
  void parsesTheStrictAnswerAction() throws IOException {
    assertEquals(HigherLowerChoice.SAME, engine.parseAction(json("{\"type\":\"ANSWER\",\"choice\":\"SAME\"}")).choice());
    for (var invalid : List.of("{\"type\":\"ANSWER\",\"choice\":\"SAME\",\"extra\":1}", "{\"type\":\"ANSWER\"}",
        "{\"type\":\"GUESS\",\"choice\":\"SAME\"}", "{\"type\":\"ANSWER\",\"choice\":\"same\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsAtLeastTwoPokemonInTheSelectedGenerations() {
    var context = GameContext.builder(new InMemoryPokemonCatalog(List.of()), new Mulberry32(1))
        .players(List.of(new GamePlayer("p1", "Ana"))).now(1000).build();
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context));
    assertEquals("Se necesitan al menos dos Pokémon en las generaciones seleccionadas.", error.getMessage());
  }

  // ---- Racha infinita (ENDLESS) ----

  private static final HigherLowerConfig ENDLESS = new HigherLowerConfig(List.of(1, 2),
      List.of(HigherLowerConfig.HigherLowerCategory.values()), true, HigherLowerConfig.HigherLowerAnswerVisibility.REVEAL,
      HigherLowerConfig.HigherLowerDifficulty.NORMAL, 20, 10, HigherLowerMode.ENDLESS);

  private final Mulberry32 random = new Mulberry32(7);

  private GameContext at(long now, GamePlayer... players) {
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), random).players(List.of(players)).now(now).build();
  }

  private static GamePlayer[] players(int count) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= count; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return list.toArray(GamePlayer[]::new);
  }

  /** La respuesta correcta de la ronda activa (la misma cuenta que el motor al revelar). */
  private static HigherLowerChoice correct(HigherLowerState state, GameContext context) {
    var previous = context.pokemon().byId(state.previousPokemonId()).orElseThrow();
    var current = context.pokemon().byId(state.currentPokemonId()).orElseThrow();
    return HigherLowerRules.higherLowerAnswer(HigherLowerRules.pokemonCategoryValue(previous, state.category()),
        HigherLowerRules.pokemonCategoryValue(current, state.category()));
  }

  private static HigherLowerChoice wrong(HigherLowerState state, GameContext context) {
    return correct(state, context) == HigherLowerChoice.HIGHER ? HigherLowerChoice.LOWER : HigherLowerChoice.HIGHER;
  }

  private HigherLowerState startEndless(GameContext context) {
    return engine.start(engine.createInitialState(ENDLESS, context), context);
  }

  private HigherLowerState answer(HigherLowerState state, String playerId, HigherLowerChoice choice, GameContext context) {
    var result = engine.handleAction(state, playerId, new HigherLowerAction(choice), context);
    assertTrue(result.accepted(), () -> "rechazada: " + result.error());
    return result.state();
  }

  /** Del revelado a la ronda siguiente (o al final), en el plazo del servidor. */
  private HigherLowerState next(HigherLowerState state, GamePlayer... players) {
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    return engine.handleTimeout(state, at(state.nextTransitionAt(), players));
  }

  @Test
  void wrongAnswerEliminates() {
    var players = players(3);
    var context = at(1_000, players);
    var state = startEndless(context);
    state = answer(state, "p1", correct(state, context), context);
    state = answer(state, "p2", wrong(state, context), context);
    state = answer(state, "p3", correct(state, context), context);
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    var view = engine.getPublicState(state, context);
    assertEquals(HigherLowerMode.ENDLESS, view.mode());
    assertEquals(List.of("p1", "p3"), view.alive());
    // La racha de quien cae se congela (no vuelve a 0) y es su puntuación.
    assertEquals(Map.of("p1", 1, "p2", 0, "p3", 1), view.streaks());
    assertEquals(view.streaks(), view.scores());
    state = next(state, players);
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    var later = at(state.roundStartedAt() + 1, players);
    assertFalse(engine.getPlayerState(state, "p2", later).canAnswer());
    assertTrue(engine.getPlayerState(state, "p1", later).canAnswer());
    var rejected = engine.handleAction(state, "p2", new HigherLowerAction(HigherLowerChoice.HIGHER), later);
    assertFalse(rejected.accepted());
    assertEquals("Estás eliminado.", rejected.error());
    // Completan la ronda los que siguen en pie: el eliminado, aunque esté conectado, no la bloquea.
    state = answer(state, "p1", correct(state, later), later);
    state = answer(state, "p3", correct(state, later), later);
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertFalse(state.lastRound().outcomes().containsKey("p2"));
    assertEquals(Map.of("p1", 2, "p2", 0, "p3", 2), state.streaks());
  }

  @Test
  void noAnswerEliminates() {
    var players = players(2);
    var context = at(1_000, players);
    var state = startEndless(context);
    state = answer(state, "p1", correct(state, context), context);
    state = engine.handleTimeout(state, at(state.roundEndsAt(), players));
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(List.of("p1"), engine.getPublicState(state, context).alive());
    assertFalse(state.lastRound().outcomes().get("p2").correct());
  }

  @Test
  void endsWhenNobodyAlive() {
    var players = players(2);
    var context = at(1_000, players);
    var state = startEndless(context);
    state = answer(state, "p1", correct(state, context), context);
    state = answer(state, "p2", wrong(state, context), context);
    state = next(state, players);
    var second = at(state.roundStartedAt() + 1_000, players);
    state = answer(state, "p1", wrong(state, second), second);
    assertEquals(GamePhase.ROUND_RESULTS, state.phase(), "solo p1 sigue en pie: su respuesta cierra la ronda");
    assertEquals(List.of(), engine.getPublicState(state, second).alive());
    state = next(state, players);
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    assertEquals(2, state.roundNumber());
    var results = engine.getResults(state);
    assertEquals("p1", results.winnerId());
    assertEquals(List.of("p1", "p2"), results.standings().stream().map(GameStanding::playerId).toList());
    assertEquals(List.of(1, 0), results.standings().stream().map(GameStanding::points).toList());
  }

  @Test
  void allEliminatedSameRoundTie() {
    var players = players(2);
    var context = at(1_000, players);
    var state = startEndless(context);
    state = answer(state, "p1", correct(state, context), context);
    state = answer(state, "p2", correct(state, context), context);
    state = next(state, players);
    var second = at(state.roundStartedAt() + 1_000, players);
    state = answer(state, "p1", wrong(state, second), second);
    state = answer(state, "p2", wrong(state, second), second);
    state = next(state, players);
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    var results = engine.getResults(state);
    assertNull(results.winnerId());
    assertEquals(List.of(1, 1), results.standings().stream().map(GameStanding::position).toList());
    assertEquals(List.of(1, 1), results.standings().stream().map(GameStanding::points).toList());
  }

  @Test
  void disconnectAfterGraceCountsAsFail() {
    var players = players(3);
    var context = at(1_000, players);
    var state = startEndless(context);
    state = answer(state, "p1", correct(state, context), context);
    state = answer(state, "p2", correct(state, context), context);
    // p3 agota su gracia de presencia (deja de estar activo) sin responder: la ronda se resuelve y cae.
    var expired = new GamePlayer[] {players[0], players[1], new GamePlayer("p3", "Player 3", false, false)};
    state = engine.handlePresenceChange(state, at(2_000, expired));
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertEquals(List.of("p1", "p2"), engine.getPublicState(state, context).alive());
    assertFalse(state.lastRound().outcomes().get("p3").correct());
    // Si también se van los que siguen en pie, la partida termina igualmente.
    state = next(state, expired);
    var gone = new GamePlayer[] {new GamePlayer("p1", "Player 1", false, false), new GamePlayer("p2", "Player 2", false, false),
        expired[2]};
    state = engine.handlePresenceChange(state, at(state.roundStartedAt() + 1_000, gone));
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    state = next(state, gone);
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    assertNull(engine.getResults(state).winnerId());
  }

  @Test
  void safetyCapAt100Rounds() {
    var players = players(1);
    var context = at(1_000, players);
    var state = startEndless(context);
    assertEquals(HigherLowerEngine.ENDLESS_MAX_ROUNDS, engine.getPublicState(state, context).totalRounds());
    for (int round = 1; round <= 100; round++) {
      assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
      assertEquals(round, state.roundNumber());
      var now = at(state.roundStartedAt() + 1_000, players);
      state = next(answer(state, "p1", correct(state, now), now), players);
    }
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    assertEquals(100, state.roundNumber());
    assertEquals(100, engine.getResults(state).standings().getFirst().points());
  }

  @Test
  void resultsRankByStreak() {
    var players = players(2);
    var context = at(1_000, players);
    var state = startEndless(context);
    // p1 responde al instante (en Clásico, bonus de rapidez); p2, tarde. En Racha cada acierto vale 1, sin bonus.
    state = answer(state, "p1", correct(state, context), context);
    var slow = at(state.roundEndsAt() - 1, players);
    state = answer(state, "p2", correct(state, slow), slow);
    assertEquals(1, state.lastRound().outcomes().get("p1").awardedPoints());
    assertEquals(0, state.lastRound().outcomes().get("p1").speedBonus());
    state = next(state, players);
    var second = at(state.roundStartedAt(), players);
    state = answer(state, "p1", wrong(state, second), second);
    state = answer(state, "p2", correct(state, second), second);
    state = next(state, players);
    var third = at(state.roundStartedAt(), players);
    state = answer(state, "p2", wrong(state, third), third);
    state = next(state, players);
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    var results = engine.getResults(state);
    assertEquals("p2", results.winnerId());
    assertEquals(List.of("p2", "p1"), results.standings().stream().map(GameStanding::playerId).toList());
    assertEquals(List.of(2, 1), results.standings().stream().map(GameStanding::points).toList());
    assertEquals(2, results.standings().getFirst().stats().get("bestStreak"));
  }
}

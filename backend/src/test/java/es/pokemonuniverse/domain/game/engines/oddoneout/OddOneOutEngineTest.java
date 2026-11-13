package es.pokemonuniverse.domain.game.engines.oddoneout;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static es.pokemonuniverse.support.EngineTestKit.wire;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutAction;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutPlayerState;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import es.pokemonuniverse.support.EngineTestKit;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Votos, cierre de ronda, plazos, presencia, errores y privacidad del motor de El Intruso, con el catálogo dorado, un
 * azar fijo ({@code Mulberry32}) y un reloj controlado. La partida empieza a {@code now = 1000}.
 */
class OddOneOutEngineTest {

  private static final InMemoryPokemonCatalog CATALOG = GoldenCatalogs.load("gen1-2");

  private final OddOneOutEngine engine = new OddOneOutEngine(GoldenManifests.of(OddOneOutEngine.ID));

  private static GameContext context(int players, long seed) {
    return EngineTestKit.builder(CATALOG, seed, players).build();
  }

  private static OddOneOutConfig config(int rounds) {
    return new OddOneOutConfig(List.of(1, 2), rounds, 20);
  }

  private OddOneOutState started(OddOneOutConfig config, GameContext context) {
    return engine.start(engine.createInitialState(config, context), context);
  }

  private static OddOneOutAction vote(String optionId) {
    return new OddOneOutAction(optionId);
  }

  private static String intruder(OddOneOutState state) {
    return state.board().intruderOptionId();
  }

  /** Una opción que no es el intruso. */
  private static String wrong(OddOneOutState state) {
    return OddOneOutTypes.OPTION_IDS.stream().filter(id -> !id.equals(intruder(state))).findFirst().orElseThrow();
  }

  private OddOneOutState accepted(OddOneOutState state, String playerId, String optionId, GameContext context,
      long now) {
    var result = engine.handleAction(state, playerId, vote(optionId), context.withNow(now));
    assertTrue(result.accepted(), () -> "rechazada: " + result.error());
    return result.state();
  }

  private GameActionResult<OddOneOutState> act(OddOneOutState state, String playerId, String optionId,
      GameContext context, long now) {
    return engine.handleAction(state, playerId, vote(optionId), context.withNow(now));
  }

  private void rejected(OddOneOutState state, String playerId, String optionId, GameContext context, long now,
      String error) {
    var result = act(state, playerId, optionId, context, now);
    assertFalse(result.accepted());
    assertEquals(error, result.error());
    assertSame(state, result.state());
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("odd-one-out", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  /** {@code config-cases.json} graba {@code 5.0} como {@code 5}: el entero con decimales se prueba aquí. */
  @Test
  void parsesIntegersWrittenWithDecimals() throws IOException {
    var config = engine.parseConfig(json("{\"generations\":[2,1,1],\"rounds\":5.0,\"roundSeconds\":15.0}"));
    assertEquals(new OddOneOutConfig(List.of(1, 2), 5, 15), config);
    var error = assertThrows(ConfigValidationException.class,
        () -> engine.parseConfig(json("{\"generations\":[1],\"rounds\":5.5,\"roundSeconds\":20}")));
    assertTrue(error.getMessage().startsWith("Configuración de El Intruso no válida: "), error.getMessage());
    assertThrows(ConfigValidationException.class,
        () -> engine.parseConfig(json("{\"generations\":[1],\"rounds\":5,\"roundSeconds\":20,\"mode\":\"CLASSIC\"}")));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("shiny-vote");
    assertThrows(IllegalArgumentException.class, () -> new OddOneOutEngine(other));
  }

  /** Tres aciertos en orden de {@code votedAt} suman 4, 3 y 2; el cuarto, 1; un fallo, 0. El voto queda bloqueado. */
  @Test
  void voteLocksAndScoresByOrder() {
    var context = context(5, 11);
    var state = started(config(3), context);
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    var right = intruder(state);
    state = accepted(state, "p2", right, context, 2_000);
    rejected(state, "p2", wrong(state), context, 2_100, "Ya has votado en esta ronda.");
    var own = (OddOneOutPlayerState) engine.getPlayerState(state, "p2", context);
    assertFalse(own.canVote());
    assertEquals(right, own.vote().optionId());
    assertEquals(2_000, own.vote().votedAt());
    state = accepted(state, "p1", right, context, 2_500);
    state = accepted(state, "p3", right, context, 3_000);
    state = accepted(state, "p4", wrong(state), context, 3_500);
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    state = accepted(state, "p5", right, context, 4_000);
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    var round = state.lastRound();
    assertEquals(right, round.intruderOptionId());
    assertEquals(Map.of("p1", 3, "p2", 4, "p3", 2, "p4", 0, "p5", 1), round.points());
    assertEquals(List.of("p1", "p2", "p3", "p4", "p5"), List.copyOf(round.points().keySet()));
    assertEquals(Map.of("p1", 3, "p2", 4, "p3", 2, "p4", 0, "p5", 1), state.scores());
    assertEquals(1, state.playerStats().get("p4").votes());
    assertEquals(0, state.playerStats().get("p4").correctVotes());
    assertEquals(1, state.playerStats().get("p5").correctVotes());
  }

  /** Un empate de {@code votedAt} se rompe por el orden de {@code playerIds}. */
  @Test
  void simultaneousVotesFollowThePlayerOrder() {
    var context = context(2, 12);
    var state = started(config(3), context);
    state = accepted(state, "p2", intruder(state), context, 2_000);
    state = accepted(state, "p1", intruder(state), context, 2_000);
    assertEquals(Map.of("p1", 4, "p2", 3), state.lastRound().points());
  }

  /** La ronda se cierra en cuanto votan todos los necesarios, también si el que falta se desconecta (Review Focus 4). */
  @Test
  void roundClosesWhenEveryRequiredPlayerVoted() {
    var context = context(3, 13);
    var state = started(config(3), context);
    state = accepted(state, "p1", wrong(state), context, 2_000);
    state = accepted(state, "p2", intruder(state), context, 3_000);
    assertEquals(GamePhase.ROUND_ACTIVE, state.phase());
    var closed = accepted(state, "p3", intruder(state), context, 4_000);
    assertEquals(GamePhase.ROUND_RESULTS, closed.phase());
    assertNull(closed.roundEndsAt());
    assertEquals(4_000 + OddOneOutRules.REVEAL_MS, closed.nextTransitionAt());

    // p3 se desconecta sin votar: el cambio de presencia cierra la ronda sin esperar al reloj.
    var players = new ArrayList<>(EngineTestKit.players(3));
    players.set(2, new GamePlayer("p3", "Player 3", false, null));
    var gone = context.withPlayers(players).withNow(5_000);
    var byPresence = engine.handlePresenceChange(state, gone);
    assertEquals(GamePhase.ROUND_RESULTS, byPresence.phase());
    assertEquals(5_000 + OddOneOutRules.REVEAL_MS, byPresence.nextTransitionAt());
    assertEquals(0, byPresence.lastRound().points().get("p3"));
    assertEquals(0, byPresence.playerStats().get("p3").votes());

    // Desconectado antes: el último voto de los conectados ya cierra la ronda.
    var early = started(config(3), context);
    early = engine.handlePresenceChange(early, gone.withNow(1_500));
    assertEquals(GamePhase.ROUND_ACTIVE, early.phase());
    early = accepted(early, "p1", intruder(early), gone, 2_000);
    early = accepted(early, "p2", intruder(early), gone, 2_500);
    assertEquals(GamePhase.ROUND_RESULTS, early.phase());

    // Con todos conectados, el cambio de presencia no cierra nada.
    assertSame(state, engine.handlePresenceChange(state, context.withNow(5_000)));
  }

  @Test
  void timeoutRevealsAndAdvances() {
    var context = context(2, 14);
    var state = started(config(3), context);
    assertEquals(1, state.roundNumber());
    assertEquals(1_000, state.roundStartedAt());
    assertEquals(21_000, state.roundEndsAt());
    assertSame(state, engine.handleTimeout(state, context.withNow(20_999)));
    state = accepted(state, "p1", intruder(state), context, 5_000);
    var firstCategory = state.board().category().id();
    var revealed = engine.handleTimeout(state, context.withNow(21_000));
    assertEquals(GamePhase.ROUND_RESULTS, revealed.phase());
    assertEquals(26_000, revealed.nextTransitionAt());
    assertEquals(Map.of("p1", 4, "p2", 0), revealed.lastRound().points());
    assertEquals(firstCategory, revealed.lastRound().category().id());
    assertEquals(0, revealed.playerStats().get("p2").votes());
    assertSame(revealed, engine.handleTimeout(revealed, context.withNow(25_999)));
    var second = engine.handleTimeout(revealed, context.withNow(26_000));
    assertEquals(GamePhase.ROUND_ACTIVE, second.phase());
    assertEquals(2, second.roundNumber());
    assertEquals(Map.of(), second.votes());
    assertNull(second.lastRound());
    assertEquals(46_000, second.roundEndsAt());
    assertNotEquals(firstCategory, second.board().category().id());
    assertEquals(List.of(firstCategory, second.board().category().id()), second.usedCategoryIds());
    assertEquals(8, second.usedPokemonIds().size());
    var lifecycle = engine.getLifecycle(second);
    assertEquals(GamePhase.ROUND_ACTIVE, lifecycle.phase());
    assertEquals(46_000, lifecycle.nextDeadline());
  }

  @Test
  void gameEndsAfterLastRound() {
    var context = context(2, 15);
    var state = started(config(3), context);
    long now = 1_000;
    state = accepted(state, "p1", intruder(state), context, 2_000);
    state = accepted(state, "p2", wrong(state), context, 2_500);
    var categories = new HashSet<String>();
    for (int round = 1; round <= 3; round++) {
      assertEquals(round, state.roundNumber());
      categories.add(state.board().category().id());
      if (state.phase() == GamePhase.ROUND_ACTIVE) state = engine.handleTimeout(state, context.withNow(state.roundEndsAt()));
      assertEquals(GamePhase.ROUND_RESULTS, state.phase());
      assertFalse(engine.isFinished(state));
      now = state.nextTransitionAt();
      state = engine.handleTimeout(state, context.withNow(now));
    }
    assertEquals(3, categories.size());
    assertEquals(GamePhase.GAME_RESULTS, state.phase());
    assertTrue(engine.isFinished(state));
    assertNull(state.roundEndsAt());
    assertNull(state.nextTransitionAt());
    assertSame(state, engine.handleTimeout(state, context.withNow(now + 60_000)));
    var results = engine.getResults(state);
    assertEquals("p1", results.winnerId());
    var first = results.standings().getFirst();
    assertEquals("p1", first.playerId());
    assertEquals(4, first.points());
    assertEquals(Map.of("correctVotes", 1, "votes", 1, "incorrectVotes", 0, "unanswered", 2, "accuracy", 100L),
        first.stats());
    GameStanding second = results.standings().get(1);
    assertEquals(Map.of("correctVotes", 0, "votes", 1, "incorrectVotes", 1, "unanswered", 2, "accuracy", 0L),
        second.stats());
    var publicState = engine.getPublicState(state, context);
    assertNotNull(publicState.results());
    assertNotNull(publicState.lastRound());
  }

  /** Todos los literales del servidor y la acción mal formada. */
  @Test
  void rejectsInvalidActions() throws IOException {
    var context = context(2, 16);
    var initial = engine.createInitialState(config(3), context);
    rejected(initial, "p1", "A", context, 1_000, "La ronda no está activa.");
    var state = engine.start(initial, context);
    rejected(state, "p9", "A", context, 2_000, "Estás observando esta partida.");
    var inactive = context.withPlayers(List.of(new GamePlayer("p1", "Player 1"),
        new GamePlayer("p2", "Player 2", true, false)));
    rejected(state, "p2", "A", inactive, 2_000, "Estás observando esta partida.");
    rejected(state, "p1", "E", context, 2_000, "Esa opción no existe.");
    var voted = accepted(state, "p1", wrong(state), context, 2_000);
    rejected(voted, "p1", intruder(state), context, 2_100, "Ya has votado en esta ronda.");

    // Voto tardío: se rechaza y la ronda se revela con lo que había, como en Shiny Quiz.
    var late = act(voted, "p2", intruder(state), context, 21_000);
    assertFalse(late.accepted());
    assertEquals("El tiempo de la ronda ha terminado.", late.error());
    assertEquals(GamePhase.ROUND_RESULTS, late.state().phase());
    assertEquals(0, late.state().lastRound().points().get("p2"));
    rejected(late.state(), "p2", "A", context, 21_500, "La ronda no está activa.");

    for (var invalid : List.of("{\"type\":\"VOTE\",\"optionId\":\"E\"}", "{\"type\":\"VOTE\",\"optionId\":\"a\"}",
        "{\"type\":\"VOTE\",\"optionId\":\"A\",\"extra\":1}", "{\"type\":\"vote\",\"optionId\":\"A\"}",
        "{\"type\":\"VOTE\"}", "null")) {
      var error = assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
      assertEquals("Acción de El Intruso no válida.", error.getMessage());
    }
    assertEquals("C", engine.parseAction(json("{\"type\":\"VOTE\",\"optionId\":\"C\"}")).optionId());

    var gen9 = new OddOneOutConfig(List.of(9), 3, 20);
    assertEquals("No hay categorías suficientes en esas generaciones.",
        engine.checkAvailability(gen9, context).orElseThrow());
    assertTrue(engine.checkAvailability(config(3), context).isEmpty());
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(gen9, context));
    assertEquals("No hay categorías suficientes en esas generaciones.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.createInitialState(config(3), context(0, 16)));
    assertEquals("Se necesita al menos 1 jugador.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.start(state, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
  }

  /** {@code createInitialState} no consume azar: el tablero sale en {@code start}. */
  @Test
  void initialStateHasNoBoard() {
    var context = context(2, 17);
    var initial = engine.createInitialState(config(3), context);
    assertEquals(GamePhase.GAME_STARTING, initial.phase());
    assertNull(initial.board());
    assertEquals(Map.of("p1", 0, "p2", 0), initial.scores());
    var publicState = engine.getPublicState(initial, context);
    assertEquals(List.of(), publicState.options());
    assertEquals(0, publicState.roundNumber());
    assertEquals(3, publicState.totalRounds());
  }

  /**
   * Review Focus 1: durante la ronda ni la vista pública ni la de otro jugador llevan la categoría, el intruso ni los
   * votos ajenos. Las mismas sondas sí los encuentran al revelar, para que el test no pase en vacío.
   */
  @Test
  void activeRoundLeaksNothing() {
    var context = context(3, 18);
    var state = started(config(3), context);
    state = accepted(state, "p1", wrong(state), context, 2_000);
    var category = state.board().category();
    var p1Vote = "\"optionId\":\"" + wrong(state) + "\"";
    var probes = List.of("intruderOptionId", "\"category\"", "\"votes\"", "votedAt", p1Vote,
        "\"" + category.label() + "\"", "\"" + category.explanation() + "\"", "\"" + category.id() + "\"");
    var views = List.of(wire(engine.getPublicState(state, context)), wire(engine.getPlayerState(state, "p2", context)),
        wire(engine.getPlayerState(state, "p9", context)), wire(engine.getLifecycle(state)));
    for (var view : views) {
      for (var probe : probes) assertFalse(view.contains(probe), () -> probe + " en " + view);
    }
    var publicState = engine.getPublicState(state, context);
    assertEquals(List.of("p1"), publicState.votedPlayerIds());
    assertEquals(4, publicState.options().size());
    assertNull(publicState.lastRound());
    // El voto propio sí sale en la vista del que votó.
    assertTrue(wire(engine.getPlayerState(state, "p1", context)).contains(p1Vote));

    var revealed = engine.handleTimeout(state, context.withNow(state.roundEndsAt()));
    var publicView = wire(engine.getPublicState(revealed, context));
    for (var probe : probes) assertTrue(publicView.contains(probe), () -> probe + " no está al revelar");
  }

  /** Un observador (fuera de {@code playerIds}) ni vota ni bloquea el cierre de la ronda. */
  @Test
  void spectatorCannotVote() {
    var context = context(2, 19);
    var state = started(config(3), context);
    var watching = context.withPlayers(List.of(new GamePlayer("p1", "Player 1"), new GamePlayer("p2", "Player 2"),
        new GamePlayer("p9", "Player 9", true, false)));
    var spectator = (OddOneOutPlayerState) engine.getPlayerState(state, "p9", watching);
    assertFalse(spectator.canVote());
    assertNull(spectator.vote());
    assertTrue(((OddOneOutPlayerState) engine.getPlayerState(state, "p1", watching)).canVote());
    rejected(state, "p9", "A", watching, 2_000, "Estás observando esta partida.");
    state = accepted(state, "p1", intruder(state), watching, 2_000);
    state = accepted(state, "p2", intruder(state), watching, 2_500);
    assertEquals(GamePhase.ROUND_RESULTS, state.phase());
    assertFalse(state.lastRound().points().containsKey("p9"));
    assertFalse(((OddOneOutPlayerState) engine.getPlayerState(state, "p1", watching)).canVote());
  }
}

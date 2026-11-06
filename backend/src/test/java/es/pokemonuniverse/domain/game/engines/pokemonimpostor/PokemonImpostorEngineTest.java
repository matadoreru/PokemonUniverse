package es.pokemonuniverse.domain.game.engines.pokemonimpostor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorClue;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.ImpostorRole;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.PokemonImpostorAction;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.PokemonImpostorPlayerState;
import es.pokemonuniverse.domain.game.engines.pokemonimpostor.PokemonImpostorTypes.PokemonImpostorState;
import es.pokemonuniverse.domain.json.JsonTree;
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

/**
 * Lo que las fixtures doradas no cubren: manifiesto, parseo, errores de arranque (el exportador no los captura) y la
 * pista ya bloqueada, inalcanzable con el flujo normal.
 */
class PokemonImpostorEngineTest {

  private final PokemonImpostorEngine engine = new PokemonImpostorEngine(GoldenManifests.of(PokemonImpostorEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000).build();
  }

  private static PokemonImpostorConfig config(List<Integer> generations, int impostorCount) {
    return PokemonImpostorConfig.builder().generations(generations).impostorCount(impostorCount).clueSeconds(15)
        .voteSeconds(20).build();
  }

  /** Fase de pistas de la primera ronda: arranca en 1000 y el revelado de roles vence a los 5 s. */
  private PokemonImpostorState cluePhase(GameContext context) {
    var startContext = context.withNow(1_000);
    var state = engine.start(engine.createInitialState(config(List.of(1), 1), startContext), startContext);
    var clues = engine.handleTimeout(state, context.withNow(6_000));
    assertEquals(GamePhase.CLUE_PHASE, clues.phase());
    return clues;
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokemon-impostor", engine.manifest().id());
    assertEquals(3, engine.manifest().minPlayers());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokemonImpostorEngine(other));
  }

  /** {@code 2.0} es un entero en JS; las claves desconocidas se descartan porque el esquema no es estricto. */
  @Test
  void parsesIntegralDoublesAndDropsUnknownKeys() throws IOException {
    var parsed = engine.parseConfig(json(
        "{\"generations\":[2,1,2.0],\"impostorCount\":2.0,\"clueSeconds\":120.0,\"voteSeconds\":10,\"extra\":true}"));
    assertEquals(List.of(1, 2), parsed.generations());
    assertEquals(2, parsed.impostorCount());
    assertEquals(120, parsed.clueSeconds());
    assertEquals(10, parsed.voteSeconds());
    for (var invalid : List.of("{\"generations\":[1],\"impostorCount\":2.5,\"clueSeconds\":15,\"voteSeconds\":20}",
        "{\"generations\":[1],\"impostorCount\":1,\"clueSeconds\":15,\"voteSeconds\":9007199254740992}",
        "{\"generations\":[1],\"impostorCount\":1,\"clueSeconds\":15}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseConfig(json(invalid)), invalid);
    }
  }

  /** Los límites de longitud cuentan unidades UTF-16; el tipo es sensible a mayúsculas y cada variante es estricta. */
  @Test
  void parsesTheStrictActions() throws IOException {
    var emptyClue = engine.parseAction(json("{\"type\":\"SUBMIT_CLUE\",\"text\":\"\"}"));
    assertEquals("", assertInstanceOf(PokemonImpostorAction.SubmitClue.class, emptyClue).text());
    var emojiClue = "🔥".repeat(100);
    var longClue = engine.parseAction(json("{\"type\":\"SUBMIT_CLUE\",\"text\":\"" + emojiClue + "\"}"));
    assertEquals(emojiClue, assertInstanceOf(PokemonImpostorAction.SubmitClue.class, longClue).text());
    var vote = engine.parseAction(json("{\"type\":\"VOTE\",\"targetId\":\"" + "p".repeat(64) + "\"}"));
    assertEquals("p".repeat(64), assertInstanceOf(PokemonImpostorAction.Vote.class, vote).targetId());
    var guess = engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\"}"));
    assertEquals("pikachu", assertInstanceOf(PokemonImpostorAction.GuessPokemon.class, guess).pokemonId());
    for (var invalid : List.of("{\"type\":\"SUBMIT_CLUE\",\"text\":\"" + "x".repeat(201) + "\"}",
        "{\"type\":\"SUBMIT_CLUE\",\"text\":\"" + "🔥".repeat(101) + "\"}",
        "{\"type\":\"SUBMIT_CLUE\",\"text\":\"hola\",\"extra\":1}", "{\"type\":\"SUBMIT_CLUE\"}",
        "{\"type\":\"VOTE\",\"targetId\":\"\"}", "{\"type\":\"VOTE\",\"targetId\":\"" + "p".repeat(65) + "\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + "a".repeat(65) + "\"}",
        "{\"type\":\"vote\",\"targetId\":\"p1\"}", "{\"targetId\":\"p1\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  /** {@code trim()} de JS (incluye U+00A0 y U+3000) seguido de NFC; mayúsculas y espacios internos se conservan. */
  @Test
  void normalizesCluesWithJsTrimAndNfc() {
    assertEquals("Ratón  ÉLÉCTRICO", PokemonImpostorEngine.normalizedClue("   Ratón  ÉLÉCTRICO 　"));
    assertEquals("", PokemonImpostorEngine.normalizedClue("  ﻿ "));
  }

  @Test
  void needsThreePlayersMoreInnocentsAndAPokemonPool() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(config(List.of(1), 1), context(2)));
    assertEquals("Se necesitan al menos 3 jugadores.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.createInitialState(config(List.of(1), 2), context(4)));
    assertEquals("Debe haber más inocentes que impostores al comenzar.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.createInitialState(config(List.of(9), 1), context(3)));
    assertEquals("Las generaciones seleccionadas no contienen Pokémon.", error.getMessage());
    var state = engine.createInitialState(config(List.of(1), 2), context(5));
    assertEquals(2, state.roles().values().stream().filter(role -> role == ImpostorRole.IMPOSTOR).count());
  }

  @Test
  void startsOnlyOnce() {
    var context = context(3);
    var started = engine.start(engine.createInitialState(config(List.of(1), 1), context), context);
    var error = assertThrows(EngineException.class, () -> engine.start(started, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
  }

  @Test
  void resultsAreUnavailableBeforeTheEnd() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(config(List.of(1), 1), context), context);
    var error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }

  /** Inalcanzable en el flujo normal: el turno avanza al guardar la pista. Se monta el estado a mano. */
  @Test
  void rejectsALockedClue() {
    var context = context(3).withNow(7_000);
    var state = cluePhase(context);
    var current = state.clueOrder().get(state.currentClueTurnIndex());
    var locked = state.toBuilder()
        .clues(Map.of(state.roundNumber(), Map.of(current, new ImpostorClue("Bola", 6_500L,
            PokemonImpostorTypes.ClueStatus.SUBMITTED))))
        .build();
    var result = engine.handleAction(locked, current, new PokemonImpostorAction.SubmitClue("Otra"), context);
    assertFalse(result.accepted());
    assertEquals("Tu pista ya está bloqueada.", result.error());
    assertSame(locked, result.state());
  }

  /** El impostor vivo no ve el Pokémon secreto; un inocente sí. */
  @Test
  void hidesTheSecretFromTheLivingImpostor() {
    var context = context(3).withNow(7_000);
    var state = cluePhase(context);
    for (var playerId : state.playerIds()) {
      var view = assertInstanceOf(PokemonImpostorPlayerState.class, engine.getPlayerState(state, playerId, context));
      assertEquals(state.roles().get(playerId), view.role());
      if (view.role() == ImpostorRole.IMPOSTOR) assertNull(view.secretPokemon());
      else assertNotNull(view.secretPokemon());
      assertNull(view.revealedRoles());
    }
    var outsider = assertInstanceOf(PokemonImpostorPlayerState.class, engine.getPlayerState(state, "p9", context));
    assertNull(outsider.role());
    assertNull(outsider.secretPokemon());
  }

  // --- Modo Una palabra ---

  private PokemonImpostorState oneWordCluePhase(GameContext context) {
    var oneWord = PokemonImpostorConfig.builder().generations(List.of(1)).impostorCount(1).clueSeconds(15)
        .voteSeconds(20).mode(PokemonImpostorMode.ONE_WORD).build();
    var startContext = context.withNow(1_000);
    var state = engine.start(engine.createInitialState(oneWord, startContext), startContext);
    return engine.handleTimeout(state, context.withNow(6_000));
  }

  @Test
  void multiWordClueRejected() {
    var context = context(3).withNow(7_000);
    var state = oneWordCluePhase(context);
    var current = state.currentCluePlayerId();
    var result = engine.handleAction(state, current, new PokemonImpostorAction.SubmitClue("dos palabras"), context);
    assertFalse(result.accepted());
    assertEquals("La pista debe ser una sola palabra.", result.error());
    assertSame(state, result.state());
    var tab = engine.handleAction(state, current, new PokemonImpostorAction.SubmitClue("uno\tdos"), context);
    assertEquals("La pista debe ser una sola palabra.", tab.error());
  }

  @Test
  void trimmedSingleWordAccepted() {
    var context = context(3).withNow(7_000);
    var state = oneWordCluePhase(context);
    var current = state.currentCluePlayerId();
    var result = engine.handleAction(state, current, new PokemonImpostorAction.SubmitClue("  Bola \u00a0"), context);
    assertTrue(result.accepted());
    assertEquals("Bola", result.state().roundClues().get(current).text());
  }

  @Test
  void twoClueRoundsBeforeVote() {
    var context = context(3).withNow(7_000);
    var state = oneWordCluePhase(context);
    assertEquals(PokemonImpostorMode.ONE_WORD, engine.getPublicState(state, context).mode());
    for (int lap = 1; lap <= 2; lap++) {
      assertEquals(GamePhase.CLUE_PHASE, state.phase());
      assertEquals(lap, engine.getPublicState(state, context).clueLap());
      assertEquals(lap, state.roundNumber());
      for (int turn = 0; turn < 3; turn++) {
        assertEquals(GamePhase.CLUE_PHASE, state.phase());
        state = engine.handleAction(state, state.currentCluePlayerId(),
            new PokemonImpostorAction.SubmitClue("L" + lap + "T" + turn), context).state();
      }
    }
    assertEquals(GamePhase.VOTING, state.phase());
    assertEquals(2, state.clues().size());
    assertEquals(1, state.votingRound());
  }

  @Test
  void classicUnchanged() {
    var context = context(3).withNow(7_000);
    var state = cluePhase(context);
    var view = engine.getPublicState(state, context);
    assertEquals(PokemonImpostorMode.CLASSIC, view.mode());
    assertNull(view.clueLap());
    var multi = engine.handleAction(state, state.currentCluePlayerId(),
        new PokemonImpostorAction.SubmitClue("dos palabras"), context);
    assertTrue(multi.accepted());
    state = multi.state();
    for (int turn = 1; turn < 3; turn++) {
      state = engine.handleAction(state, state.currentCluePlayerId(), new PokemonImpostorAction.SubmitClue("x"),
          context).state();
    }
    assertEquals(GamePhase.VOTING, state.phase());
    assertEquals(1, state.clues().size());
  }
}

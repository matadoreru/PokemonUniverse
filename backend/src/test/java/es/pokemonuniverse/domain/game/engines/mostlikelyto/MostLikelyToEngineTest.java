package es.pokemonuniverse.domain.game.engines.mostlikelyto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engine.infra.PromptSource;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToAction;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToPlayerState;
import es.pokemonuniverse.domain.game.engines.mostlikelyto.MostLikelyToTypes.MostLikelyToState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import es.pokemonuniverse.golden.GoldenRun;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.function.BiConsumer;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, parseo, preguntas oficiales y errores de arranque; y la
 * privacidad de respuestas y votos, comprobada paso a paso sobre los escenarios dorados.
 */
class MostLikelyToEngineTest {

  private final MostLikelyToEngine engine = new MostLikelyToEngine(GoldenManifests.of(MostLikelyToEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000)
        .hostCustomCategories(List.<SubjectiveCategory>of()).build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("most-likely-to", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new MostLikelyToEngine(other));
  }

  /** Mismo número de preguntas, en el mismo orden, que tenía {@code most-likely-to/prompts.ts}. */
  @Test
  void officialPromptsMatchTheTypeScriptList() {
    var prompts = MostLikelyToPrompts.OFFICIAL;
    assertEquals(40, prompts.size());
    assertEquals(new SubjectiveCategory("most-likely-to-official-01",
        "¿Qué Pokémon sería más probable que llegase tarde a una cita?"), prompts.getFirst());
    assertEquals(new SubjectiveCategory("most-likely-to-official-40",
        "¿Qué Pokémon sería más probable que fuese el jefe final?"), prompts.getLast());
  }

  @Test
  void parsesTheStrictActions() throws IOException {
    var select = engine.parseAction(json("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"" + "a".repeat(96) + "\"}"));
    assertEquals("a".repeat(96), assertInstanceOf(MostLikelyToAction.SelectPokemon.class, select).pokemonId());
    var vote = engine.parseAction(json("{\"type\":\"VOTE_ANSWER\",\"playerId\":\"" + "b".repeat(128) + "\"}"));
    assertEquals("b".repeat(128), assertInstanceOf(MostLikelyToAction.VoteAnswer.class, vote).playerId());
    for (var invalid : List.of("{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"" + "a".repeat(97) + "\"}",
        "{\"type\":\"SELECT_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"VOTE_ANSWER\",\"playerId\":\"\"}",
        "{\"type\":\"VOTE_ANSWER\",\"playerId\":\"" + "b".repeat(129) + "\"}",
        "{\"type\":\"VOTE_ANSWER\",\"playerId\":1}", "{\"type\":\"OTHER\"}", "{\"pokemonId\":\"a\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsThreePlayersAPoolAndPrompts() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context(2)));
    assertEquals("Most Likely To necesita al menos 3 jugadores.", error.getMessage());
    var emptyPool = new MostLikelyToConfig(List.of(9), 3, 30, 30, PromptSource.OFFICIAL, false);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(emptyPool, context(3)));
    assertEquals("No hay Pokémon disponibles con esta configuración.", error.getMessage());
    var custom = new MostLikelyToConfig(List.of(1), 3, 30, 30, PromptSource.CUSTOM, false);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(custom, context(3)));
    assertEquals("No hay preguntas activas para Most Likely To.", error.getMessage());
  }

  @Test
  void resultsAreUnavailableBeforeTheEnd() {
    var context = context(3);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before Most Likely To finishes", error.getMessage());
  }

  /** Mientras se elige, la vista pública solo dice quién ha respondido; cada jugador ve únicamente su Pokémon. */
  @Test
  void answersStayHiddenWhileChoosing() {
    int[] answers = {0};
    forEachState(Set.of(GamePhase.ROUND_ACTIVE), (state, run) -> {
      var publicState = engine.getPublicState(state, run.context());
      assertEquals(List.of(), publicState.revealedAnswers());
      assertEquals(List.copyOf(state.selections().keySet()), publicState.selectionCompletedIds());
      assertNull(publicState.lastRound());
      for (var playerId : state.playerIds()) {
        var view = playerView(state, playerId, run);
        assertEquals("PLAYER".equals(view.role()) ? state.selections().get(playerId) : null, view.ownChoice());
      }
      answers[0] += state.selections().size();
    });
    assertTrue(answers[0] > 0, "algún escenario responde antes de votar");
  }

  /** Durante la votación (y el desempate), nadie ve a quién votó otro; el recuento llega con los resultados. */
  @Test
  void votesStayHiddenUntilTheResults() {
    int[] votes = {0};
    forEachState(Set.of(GamePhase.VOTING, GamePhase.REVOTE), (state, run) -> {
      var publicState = engine.getPublicState(state, run.context());
      assertEquals(List.copyOf(state.votes().keySet()), publicState.votedPlayerIds());
      assertNull(publicState.lastRound());
      for (var playerId : state.playerIds()) {
        var view = playerView(state, playerId, run);
        assertEquals("PLAYER".equals(view.role()) ? state.votes().get(playerId) : null, view.ownVotePlayerId());
      }
      votes[0] += state.votes().size();
    });
    assertTrue(votes[0] > 0, "algún escenario vota");
  }

  private MostLikelyToPlayerState playerView(MostLikelyToState state, String playerId, GoldenRun run) {
    return assertInstanceOf(MostLikelyToPlayerState.class, engine.getPlayerState(state, playerId, run.context()));
  }

  /** Recorre los estados de los escenarios dorados en las fases dadas. */
  private static void forEachState(Set<GamePhase> phases, BiConsumer<MostLikelyToState, GoldenRun> check) {
    for (var file : GoldenRun.scenarios(MostLikelyToEngine.ID)) {
      GoldenRun.forEachSnapshot(MostLikelyToEngine.ID, file, run -> {
        var state = run.state(MostLikelyToState.class);
        if (phases.contains(state.phase())) check.accept(state, run);
      });
    }
  }

  /** Contrafáctico: durante la votación, cambiar a quién votó un jugador solo cambia su propia vista. */
  @Test
  void noOtherViewDependsOnAVote() {
    int[] checked = {0};
    forEachState(Set.of(GamePhase.VOTING, GamePhase.REVOTE), (state, run) -> {
      var context = run.context();
      for (var vote : state.votes().entrySet()) {
        var candidate = state.voteCandidates().stream()
            .filter(id -> !id.equals(vote.getValue()) && !id.equals(vote.getKey())).findFirst();
        if (candidate.isEmpty()) continue;
        var votes = new LinkedHashMap<>(state.votes());
        votes.put(vote.getKey(), candidate.get());
        var changed = state.toBuilder().votes(votes).build();
        assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.getLifecycle(state)),
            GoldenReplayer.tree(engine.getLifecycle(changed))));
        assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.getPublicState(state, context)),
            GoldenReplayer.tree(engine.getPublicState(changed, context))));
        for (var player : context.players()) {
          if (player.id().equals(vote.getKey())) continue;
          assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.getPlayerState(state, player.id(), context)),
              GoldenReplayer.tree(engine.getPlayerState(changed, player.id(), context))), player.id());
        }
        checked[0]++;
      }
    });
    assertTrue(checked[0] > 0, "algún escenario vota");
  }
}

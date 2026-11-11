package es.pokemonuniverse.domain.game.engines.whoami;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engines.whoami.WhoAmITypes.WhoAmIState;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import org.junit.jupiter.api.Test;

class WhoAmIRulesTest {

  private static final InMemoryPokemonCatalog GOLDEN = GoldenCatalogs.load("gen1-2");

  private static void assertInvalid(String text) {
    assertThrows(ConfigValidationException.class, () -> WhoAmIConfig.parse(json(text)), text);
  }

  private static WhoAmIConfig config(List<Integer> generations) {
    return new WhoAmIConfig(generations, 10, 45, 20);
  }

  @Test
  void parsesTheStrictConfigWithItsLimits() throws IOException {
    var parsed = WhoAmIConfig.parse(json("{\"generations\":[2,1],\"maxLaps\":20.0,\"askSeconds\":90,\"answerSeconds\":60}"));
    assertEquals(new WhoAmIConfig(List.of(1, 2), 20, 90, 60), parsed);
    assertEquals(new WhoAmIConfig(List.of(1), 3, 20, 10),
        WhoAmIConfig.parse(json("{\"generations\":[1],\"maxLaps\":3,\"askSeconds\":20,\"answerSeconds\":10}")));
    assertEquals(new WhoAmIConfig(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9), 10, 45, 20), WhoAmIConfig.defaults());
    var base = "\"generations\":[1],";
    assertInvalid("{" + base + "\"maxLaps\":10.5,\"askSeconds\":45,\"answerSeconds\":20}");
    assertInvalid("{" + base + "\"maxLaps\":2,\"askSeconds\":45,\"answerSeconds\":20}");
    assertInvalid("{" + base + "\"maxLaps\":21,\"askSeconds\":45,\"answerSeconds\":20}");
    assertInvalid("{" + base + "\"maxLaps\":10,\"askSeconds\":19,\"answerSeconds\":20}");
    assertInvalid("{" + base + "\"maxLaps\":10,\"askSeconds\":91,\"answerSeconds\":20}");
    assertInvalid("{" + base + "\"maxLaps\":10,\"askSeconds\":45,\"answerSeconds\":9}");
    assertInvalid("{" + base + "\"maxLaps\":10,\"askSeconds\":45,\"answerSeconds\":61}");
    assertInvalid("{" + base + "\"maxLaps\":10,\"askSeconds\":45,\"answerSeconds\":20,\"mode\":\"CLASSIC\"}");
    assertInvalid("{" + base + "\"maxLaps\":10,\"askSeconds\":45,\"answerSeconds\":20,\"extra\":1}");
  }

  @Test
  void parsesTheActionStrictly() throws IOException {
    assertEquals(new WhoAmITypes.WhoAmIAction.Ask("¿Soy de fuego?"),
        WhoAmITypes.WhoAmIAction.parse(json("{\"type\":\"ASK_QUESTION\",\"text\":\"  ¿Soy de fuego? \"}")));
    assertEquals(new WhoAmITypes.WhoAmIAction.Answer(WhoAmITypes.WhoAmIAnswer.PARTLY),
        WhoAmITypes.WhoAmIAction.parse(json("{\"type\":\"ANSWER_QUESTION\",\"answer\":\"PARTLY\"}")));
    assertEquals(new WhoAmITypes.WhoAmIAction.GuessSelf("pikachu"),
        WhoAmITypes.WhoAmIAction.parse(json("{\"type\":\"GUESS_SELF\",\"pokemonId\":\"pikachu\"}")));
    assertEquals(new WhoAmITypes.WhoAmIAction.Pass(), WhoAmITypes.WhoAmIAction.parse(json("{\"type\":\"PASS_TURN\"}")));
    var empty = assertThrows(ConfigValidationException.class,
        () -> WhoAmITypes.WhoAmIAction.parse(json("{\"type\":\"ASK_QUESTION\",\"text\":\"  \"}")));
    assertEquals("Escribe una pregunta antes de enviarla.", empty.getMessage());
    var longText = "x".repeat(121);
    var tooLong = assertThrows(ConfigValidationException.class,
        () -> WhoAmITypes.WhoAmIAction.parse(json("{\"type\":\"ASK_QUESTION\",\"text\":\"" + longText + "\"}")));
    assertEquals("La pregunta no puede superar 120 caracteres.", tooLong.getMessage());
    assertEquals(new WhoAmITypes.WhoAmIAction.Ask("x".repeat(120)),
        WhoAmITypes.WhoAmIAction.parse(json("{\"type\":\"ASK_QUESTION\",\"text\":\"" + "x".repeat(120) + "\"}")));
    for (var invalid : List.of("{\"type\":\"PASS_TURN\",\"extra\":1}", "{\"type\":\"ANSWER_QUESTION\",\"answer\":\"MAYBE\"}",
        "{\"type\":\"GUESS_SELF\",\"pokemonId\":\"\"}", "{\"type\":\"NOPE\"}", "[]", "{\"text\":\"a\"}")) {
      var error = assertThrows(ConfigValidationException.class, () -> WhoAmITypes.WhoAmIAction.parse(json(invalid)), invalid);
      assertEquals("Acción de ¿Quién soy? no válida.", error.getMessage());
    }
  }

  @Test
  void dealGivesEachPlayerADifferentPokemon() {
    var players = List.of("p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8");
    var pool = WhoAmIRules.pool(config(List.of(1, 2)), GOLDEN);
    var dealt = WhoAmIRules.deal(players, pool, new Random(7)::nextDouble);
    assertEquals(players, List.copyOf(dealt.keySet()));
    assertEquals(8, new HashSet<>(dealt.values().stream().map(WhoAmITypes.WhoAmIPokemon::id).toList()).size());
    assertEquals(dealt, WhoAmIRules.deal(players, pool, new Random(7)::nextDouble));
  }

  @Test
  void solvePointsHaveAFloorAndOrderBonus() {
    assertEquals(13, WhoAmIRules.solvePoints(0, 1));
    assertEquals(9, WhoAmIRules.solvePoints(3, 2));
    assertEquals(4, WhoAmIRules.solvePoints(7, 3));
    assertEquals(2, WhoAmIRules.solvePoints(9, 4));
    assertEquals(5, WhoAmIRules.solvePoints(12, 1));
  }

  @Test
  void nextTurnSkipsIneligibleAndCountsLaps() {
    var players = List.of("a", "b", "c");
    java.util.function.Predicate<String> eligible = id -> !id.equals("b");
    assertEquals(Optional.of(new WhoAmIRules.NextTurn(1, 2)), WhoAmIRules.nextTurn(players, 0, 1, 10, eligible));
    assertEquals(Optional.of(new WhoAmIRules.NextTurn(2, 0)), WhoAmIRules.nextTurn(players, 2, 1, 10, eligible));
    assertEquals(Optional.empty(), WhoAmIRules.nextTurn(players, 2, 10, 10, eligible));
    assertEquals(Optional.of(new WhoAmIRules.NextTurn(1, 0)), WhoAmIRules.firstTurn(players, eligible));
    assertEquals(Optional.of(new WhoAmIRules.NextTurn(1, 1)), WhoAmIRules.firstTurn(players, id -> id.equals("b")));
    // Si solo queda el jugador del turno, vuelve a ser su turno en la vuelta siguiente.
    assertEquals(Optional.of(new WhoAmIRules.NextTurn(2, 0)),
        WhoAmIRules.nextTurn(players, 0, 1, 10, id -> id.equals("a")));
  }

  @Test
  void nextTurnEndsWhenNobodyIsEligible() {
    var players = List.of("a", "b", "c");
    assertEquals(Optional.empty(), WhoAmIRules.nextTurn(players, 0, 1, 10, id -> false));
    assertEquals(Optional.empty(), WhoAmIRules.firstTurn(players, id -> false));
  }

  @Test
  void availabilityNeedsAPokemonPerPlayer() {
    var generations = List.of(1, 2);
    int available = WhoAmIRules.pool(config(generations), GOLDEN).size();
    assertTrue(available >= 8);
    assertEquals(Optional.empty(), WhoAmIRules.availabilityIssue(config(generations), GOLDEN, available));
    assertEquals(Optional.of("Solo hay " + available + " Pokémon en esas generaciones."),
        WhoAmIRules.availabilityIssue(config(generations), GOLDEN, available + 1));
  }

  @Test
  void resultsRankByPointsThenFewerQuestions() {
    var pokemon = new WhoAmITypes.WhoAmIPokemon("x", "X", "s", 1, List.of("fire"));
    var state = WhoAmIState.builder().phase(GamePhase.GAME_RESULTS).config(WhoAmIConfig.defaults())
        .playerIds(List.of("a", "b", "c", "d"))
        .assignments(Map.of("a", pokemon, "b", pokemon, "c", pokemon, "d", pokemon))
        .solvedPlayerIds(List.of("a", "b"))
        .questionsAsked(Map.of("a", 5, "b", 2, "c", 0, "d", 0))
        .scores(Map.of("a", 8, "b", 8, "c", 1, "d", 1)).build();
    var results = WhoAmIRules.buildResults(state);
    assertEquals(List.of("b", "a", "c", "d"),
        results.standings().stream().map(standing -> standing.playerId()).toList());
    assertEquals(List.of(1, 2, 3, 3), results.standings().stream().map(standing -> standing.position()).toList());
    assertEquals("b", results.winnerId());
    assertEquals(0, results.standings().getFirst().stats().get("gamesPlayed"));
    assertThrows(EngineException.class,
        () -> WhoAmIRules.buildResults(state.toBuilder().phase(GamePhase.TURN_ACTIVE).build()));
  }
}

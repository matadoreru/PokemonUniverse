package es.pokemonuniverse.domain.game.engines.oddoneout;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutAction;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutPlayerStats;
import es.pokemonuniverse.domain.game.engines.oddoneout.OddOneOutTypes.OddOneOutState;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class OddOneOutRulesTest {

  private static void assertInvalid(String text) {
    assertThrows(ConfigValidationException.class, () -> OddOneOutConfig.parse(json(text)), text);
  }

  @Test
  void parsesTheStrictConfigWithItsLimits() throws IOException {
    assertEquals(new OddOneOutConfig(List.of(1, 2), 30, 60),
        OddOneOutConfig.parse(json("{\"generations\":[2,1],\"rounds\":30.0,\"roundSeconds\":60}")));
    assertEquals(new OddOneOutConfig(List.of(9), 3, 10),
        OddOneOutConfig.parse(json("{\"generations\":[9],\"rounds\":3,\"roundSeconds\":10.0}")));
    assertEquals(new OddOneOutConfig(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9), 10, 20), OddOneOutConfig.defaults());
    var base = "\"generations\":[1],";
    assertInvalid("{" + base + "\"rounds\":10.5,\"roundSeconds\":20}");
    assertInvalid("{" + base + "\"rounds\":2,\"roundSeconds\":20}");
    assertInvalid("{" + base + "\"rounds\":31,\"roundSeconds\":20}");
    assertInvalid("{" + base + "\"rounds\":10,\"roundSeconds\":9}");
    assertInvalid("{" + base + "\"rounds\":10,\"roundSeconds\":61}");
    assertInvalid("{" + base + "\"rounds\":10,\"roundSeconds\":20,\"mode\":\"CLASSIC\"}");
    assertInvalid("{" + base + "\"rounds\":10,\"roundSeconds\":20,\"extra\":1}");
    var error = assertThrows(ConfigValidationException.class,
        () -> OddOneOutConfig.parse(json("{" + base + "\"rounds\":2,\"roundSeconds\":20}")));
    assertEquals(true, error.getMessage().startsWith("Configuración de El Intruso no válida"), error.getMessage());
  }

  @Test
  void parsesTheActionStrictly() throws IOException {
    assertEquals(new OddOneOutAction("D"), OddOneOutAction.parse(json("{\"type\":\"VOTE\",\"optionId\":\"D\"}")));
    for (var invalid : List.of("{\"type\":\"VOTE\",\"optionId\":\"E\"}", "{\"type\":\"VOTE\",\"optionId\":\"A\",\"x\":1}",
        "{\"type\":\"PICK\",\"optionId\":\"A\"}", "{\"type\":\"VOTE\"}", "[]")) {
      var error = assertThrows(ConfigValidationException.class, () -> OddOneOutAction.parse(json(invalid)), invalid);
      assertEquals("Acción de El Intruso no válida.", error.getMessage());
    }
  }

  @Test
  void pointsForOrder() {
    assertEquals(4, OddOneOutRules.pointsForOrder(1));
    assertEquals(3, OddOneOutRules.pointsForOrder(2));
    assertEquals(2, OddOneOutRules.pointsForOrder(3));
    assertEquals(1, OddOneOutRules.pointsForOrder(4));
    assertEquals(1, OddOneOutRules.pointsForOrder(7));
  }

  @Test
  void resultsRankByPointsThenPlayerId() {
    var state = OddOneOutState.builder().phase(GamePhase.GAME_RESULTS).config(OddOneOutConfig.defaults())
        .playerIds(List.of("c", "a", "b", "d"))
        .scores(Map.of("a", 7, "b", 9, "c", 7, "d", 0))
        .playerStats(Map.of("a", new OddOneOutPlayerStats(8, 4), "b", new OddOneOutPlayerStats(10, 5),
            "c", new OddOneOutPlayerStats(3, 3)))
        .build();
    var results = OddOneOutRules.buildResults(state);
    assertEquals(List.of("b", "a", "c", "d"), results.standings().stream().map(s -> s.playerId()).toList());
    assertEquals(List.of(1, 2, 2, 4), results.standings().stream().map(s -> s.position()).toList());
    assertEquals("b", results.winnerId());
    var stats = results.standings().get(1).stats();
    assertEquals(List.of("correctVotes", "votes", "incorrectVotes", "unanswered", "accuracy"),
        List.copyOf(stats.keySet()));
    assertEquals(4, stats.get("correctVotes"));
    assertEquals(8, stats.get("votes"));
    assertEquals(4, stats.get("incorrectVotes"));
    assertEquals(2, stats.get("unanswered"));
    assertEquals(50L, stats.get("accuracy"));
    var empty = results.standings().get(3).stats();
    assertEquals(10, empty.get("unanswered"));
    assertEquals(0L, empty.get("accuracy"));
    assertThrows(EngineException.class,
        () -> OddOneOutRules.buildResults(state.toBuilder().phase(GamePhase.ROUND_ACTIVE).build()));
  }
}

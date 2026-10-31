package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.serde.annotation.Serdeable;
import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.Test;

class GoldenReplayerTest {

  record Counter(int count) {}

  @Serdeable
  record Config(int start) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record PublicView(int count, @Nullable String note) {}

  @Serdeable
  record PlayerView(int seen) {}

  /** Contador: {@code inc} acepta, {@code reject} rechaza con "nope", {@code explode} lanza "boom". */
  static final class FakeEngine implements GameEngine<Config, Counter, JsonNode, PublicView> {
    @Override public GameManifest manifest() { return null; }

    @Override public Config parseConfig(JsonNode raw) {
      var start = raw.get("start");
      if (start == null || !start.isNumber()) throw new ConfigValidationException("start inválido");
      return new Config(start.getNumberValue().intValue());
    }

    @Override public JsonNode parseAction(JsonNode raw) { return raw; }

    @Override public Config defaultConfig() { return new Config(0); }

    @Override public Counter createInitialState(Config config, GameContext context) { return new Counter(config.start()); }

    @Override public Counter start(Counter state, GameContext context) { return state; }

    @Override public GameActionResult<Counter> handleAction(Counter state, String playerId, JsonNode action,
        GameContext context) {
      return switch (action.get("op").getStringValue()) {
        case "inc" -> GameActionResult.accept(new Counter(state.count() + 1));
        case "reject" -> GameActionResult.reject(state, "nope");
        default -> throw new EngineException("boom");
      };
    }

    @Override public PublicView getPublicState(Counter state, GameContext context) {
      return new PublicView(state.count(), null);
    }

    @Override public Counter handleTimeout(Counter state, GameContext context) { return new Counter(state.count() + 10); }



    @Override public Object getPlayerState(Counter state, String playerId, GameContext context) {
      return new PlayerView(state.count());
    }

    @Override public GameLifecycle getLifecycle(Counter state) {
      return new GameLifecycle(GamePhase.ROUND_ACTIVE, null, "e", List.of());
    }

    @Override public boolean isFinished(Counter state) { return false; }

    @Override public GameResults getResults(Counter state) { throw new UnsupportedOperationException(); }
  }

  private static final String LIFECYCLE = "{\"phase\":\"ROUND_ACTIVE\",\"nextDeadline\":null,\"actionEpoch\":\"e\",\"spectatorIds\":[]}";

  private static String snapshot(int count, String publicExtra) {
    return "{\"lifecycle\":" + LIFECYCLE + ",\"publicState\":{\"count\":" + count + publicExtra
        + "},\"playerStates\":{\"p1\":{\"seen\":" + count + "}},\"finished\":false}";
  }

  private static String ok(int count) {
    return snapshot(count, ",\"note\":null");
  }

  /** Fixture con un paso {@code step} y su resultado esperado {@code stepResult}. */
  private static GoldenFixture fixture(String step, String stepResult, String initial) throws IOException {
    var json = "{\"engineId\":\"fake\",\"scenario\":\"s\",\"seed\":42,\"catalog\":\"gen1-2\","
        + "\"players\":[{\"id\":\"p1\",\"displayName\":\"A\"}],\"config\":{\"start\":0},\"steps\":[" + step + "],"
        + "\"expected\":{\"configNormalized\":{\"start\":0},\"initial\":" + initial + ",\"afterStart\":" + ok(0)
        + ",\"afterSteps\":[" + stepResult + "]}}";
    return ObjectMapper.getDefault().readValue(json, GoldenFixture.class);
  }

  private static final String INC = "{\"kind\":\"action\",\"playerId\":\"p1\",\"action\":{\"op\":\"inc\"},\"now\":2000}";

  private static void replay(GoldenFixture fixture) {
    GoldenReplayer.replay(new FakeEngine(), fixture, new InMemoryPokemonCatalog(List.of()));
  }

  private static AssertionError failure(GoldenFixture fixture) {
    return assertThrows(AssertionError.class, () -> replay(fixture));
  }

  @Test
  void matchingFixturePasses() throws IOException {
    assertDoesNotThrow(() -> replay(fixture(INC, "{\"accepted\":true,\"snapshot\":" + ok(1) + "}", ok(0))));
  }

  @Test
  void rejectedActionAndTimeoutAndPresenceAreReplayed() throws IOException {
    assertDoesNotThrow(() -> replay(fixture(
        "{\"kind\":\"action\",\"playerId\":\"p1\",\"action\":{\"op\":\"reject\"},\"now\":2000}",
        "{\"accepted\":false,\"error\":\"nope\",\"snapshot\":" + ok(0) + "}", ok(0))));
    assertDoesNotThrow(() -> replay(fixture("{\"kind\":\"timeout\",\"now\":3000}", "{\"snapshot\":" + ok(10) + "}", ok(0))));
    assertDoesNotThrow(() -> replay(fixture(
        "{\"kind\":\"presence\",\"players\":[{\"id\":\"p1\",\"displayName\":\"A\",\"connected\":false}],\"now\":3000}",
        "{\"snapshot\":" + ok(0) + "}", ok(0))));
  }

  @Test
  void changedValueFailsNamingThePath() throws IOException {
    var error = failure(fixture(INC, "{\"accepted\":true,\"snapshot\":" + ok(5) + "}", ok(0)));
    assertTrue(error.getMessage().startsWith("fake/s: expected.afterSteps[0].snapshot.publicState.count: esperado 5, obtenido 1"),
        error.getMessage());
  }

  @Test
  void keyAbsentInJavaWhereTypeScriptHasItFails() throws IOException {
    var error = failure(fixture(INC, "{\"accepted\":true,\"snapshot\":" + ok(1) + "}", snapshot(0, ",\"note\":null,\"extra\":1")));
    assertTrue(error.getMessage().contains("expected.initial.publicState.extra: esperado 1, obtenido <ausente>"), error.getMessage());
  }

  @Test
  void nullPresentInJavaWhereTypeScriptOmitsTheKeyFails() throws IOException {
    var error = failure(fixture(INC, "{\"accepted\":true,\"snapshot\":" + ok(1) + "}", snapshot(0, "")));
    assertTrue(error.getMessage().contains("expected.initial.publicState.note: esperado <ausente>, obtenido null"), error.getMessage());
  }

  @Test
  void acceptedAndErrorMustMatch() throws IOException {
    var accepted = failure(fixture(INC, "{\"accepted\":false,\"snapshot\":" + ok(1) + "}", ok(0)));
    assertTrue(accepted.getMessage().contains("accepted: esperado false, obtenido true"), accepted.getMessage());
    var error = failure(fixture(INC, "{\"accepted\":true,\"error\":\"x\",\"snapshot\":" + ok(1) + "}", ok(0)));
    assertTrue(error.getMessage().contains("error: esperado x, obtenido null"), error.getMessage());
  }

  @Test
  void threwStepNeedsTheSameMessage() throws IOException {
    var explode = "{\"kind\":\"action\",\"playerId\":\"p1\",\"action\":{\"op\":\"explode\"},\"now\":2000}";
    assertDoesNotThrow(() -> replay(fixture(explode, "{\"threw\":\"boom\"}", ok(0))));
    var wrong = failure(fixture(explode, "{\"threw\":\"bang\"}", ok(0)));
    assertTrue(wrong.getMessage().contains("threw: esperado \"bang\", obtenido \"boom\""), wrong.getMessage());
    var noThrow = failure(fixture(INC, "{\"threw\":\"boom\"}", ok(0)));
    assertTrue(noThrow.getMessage().contains("obtenido <sin excepción>"), noThrow.getMessage());
    var unexpected = failure(fixture(explode, "{\"accepted\":true,\"snapshot\":" + ok(0) + "}", ok(0)));
    assertTrue(unexpected.getMessage().contains("lanzó"), unexpected.getMessage());
  }

  private static void configCase(String json) throws IOException {
    var configCase = ObjectMapper.getDefault().readValue(json, GoldenFixture.ConfigCase.class);
    GoldenReplayer.checkConfigCase(new FakeEngine(), "fake/config-cases[0]", configCase);
  }

  @Test
  void configCasesAreCheckedBothWays() {
    assertDoesNotThrow(() -> configCase("{\"input\":{\"start\":3},\"valid\":true,\"normalized\":{\"start\":3}}"));
    assertDoesNotThrow(() -> configCase("{\"input\":{\"start\":\"x\"},\"valid\":false}"));
    var mismatch = assertThrows(AssertionError.class,
        () -> configCase("{\"input\":{\"start\":3},\"valid\":true,\"normalized\":{\"start\":4}}"));
    assertTrue(mismatch.getMessage().contains("normalized.start: esperado 4, obtenido 3"), mismatch.getMessage());
    var accepted = assertThrows(AssertionError.class, () -> configCase("{\"input\":{\"start\":3},\"valid\":false}"));
    assertTrue(accepted.getMessage().contains("ConfigValidationException"), accepted.getMessage());
    var rejected = assertThrows(AssertionError.class,
        () -> configCase("{\"input\":{},\"valid\":true,\"normalized\":{\"start\":0}}"));
    assertTrue(rejected.getMessage().contains("rechazó"), rejected.getMessage());
  }
}

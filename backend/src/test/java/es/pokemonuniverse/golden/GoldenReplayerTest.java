package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
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
import java.util.Map;
import java.util.Optional;
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

  /** Sin {@code @JsonInclude} de clase: depende solo de la inclusión global del mapper. */
  @Serdeable
  record EmptyCollections(List<String> items, Map<String, Integer> scores, @Nullable String missing) {}

  /** Contador: {@code inc} acepta, {@code reject} rechaza con "nope", {@code explode} lanza "boom". */
  static final class FakeEngine implements GameEngine<Config, Counter, JsonNode, PublicView> {
    /** {@code getPublicState} lanza "pub" cuando el contador llega a este valor. */
    private final int failPublicAt;
    /** Lo que devuelve {@code resolveAsset}. */
    private final Optional<AssetResolution> asset;

    FakeEngine() { this(-1); }

    FakeEngine(int failPublicAt) { this(failPublicAt, Optional.empty()); }

    FakeEngine(Optional<AssetResolution> asset) { this(-1, asset); }

    FakeEngine(int failPublicAt, Optional<AssetResolution> asset) {
      this.failPublicAt = failPublicAt;
      this.asset = asset;
    }

    @Override public Optional<AssetResolution> resolveAsset(Counter state, AssetRequest request, GameContext context) {
      return asset;
    }

    @Override public GameManifest manifest() { return null; }

    @Override public Config parseConfig(JsonNode raw) {
      var start = raw.get("start");
      if (start == null || !start.isNumber()) throw new ConfigValidationException("start inválido");
      return new Config(start.getNumberValue().intValue());
    }

    @Override public JsonNode parseAction(JsonNode raw) {
      if ("bad".equals(raw.get("op").getStringValue())) throw new ConfigValidationException("acción inválida");
      return raw;
    }

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
      if (state.count() == failPublicAt) throw new EngineException("pub");
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
    replay(new FakeEngine(), fixture);
  }

  private static void replay(FakeEngine engine, GoldenFixture fixture) {
    GoldenReplayer.replay(engine, fixture, new InMemoryPokemonCatalog(List.of()));
  }

  private static AssertionError failure(GoldenFixture fixture) {
    return assertThrows(AssertionError.class, () -> replay(fixture));
  }

  private static AssertionError failure(GoldenFixture fixture, FakeEngine engine) {
    return assertThrows(AssertionError.class, () -> replay(engine, fixture));
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
    assertDoesNotThrow(() -> replay(withStoppedAt(fixture(explode, "{\"threw\":\"boom\"}", ok(0)), 0)));
    var wrong = failure(fixture(explode, "{\"threw\":\"bang\"}", ok(0)));
    assertTrue(wrong.getMessage().contains("threw: esperado \"bang\", obtenido \"boom\""), wrong.getMessage());
    var noThrow = failure(fixture(INC, "{\"threw\":\"boom\"}", ok(0)));
    assertTrue(noThrow.getMessage().contains("obtenido <sin excepción>"), noThrow.getMessage());
    var unexpected = failure(fixture(explode, "{\"accepted\":true,\"snapshot\":" + ok(0) + "}", ok(0)));
    assertTrue(unexpected.getMessage().contains("lanzó"), unexpected.getMessage());
  }

  private static final String BAD = "{\"kind\":\"action\",\"playerId\":\"p1\",\"action\":{\"op\":\"bad\"},\"now\":2000}";

  @Test
  void invalidActionMirrorsProductionParsing() throws IOException {
    assertDoesNotThrow(() -> replay(withStoppedAt(fixture(BAD, "{\"invalidAction\":true}", ok(0)), 0)));
    var vsSnapshot = failure(withStoppedAt(fixture(BAD, "{\"accepted\":true,\"snapshot\":" + ok(0) + "}", ok(0)), 0));
    assertTrue(vsSnapshot.getMessage().contains("la acción cruda no valida en Java pero sí en TS"), vsSnapshot.getMessage());
    var validInJava = failure(fixture(INC, "{\"invalidAction\":true}", ok(0)));
    assertTrue(validInJava.getMessage().contains("invalidAction: esperado true"), validInJava.getMessage());
  }

  @Test
  void stoppedAtMustMatchTheStoppingStep() throws IOException {
    var wrong = failure(withStoppedAt(fixture(BAD, "{\"invalidAction\":true}", ok(0)), 3));
    assertTrue(wrong.getMessage().contains("stoppedAt: esperado 3, obtenido 0"), wrong.getMessage());
    var missing = failure(fixture(BAD, "{\"invalidAction\":true}", ok(0)));
    assertTrue(missing.getMessage().contains("stoppedAt: esperado null, obtenido 0"), missing.getMessage());
  }

  @Test
  void exceptionWhileProjectingAfterAStepIsComparedAsThrew() throws IOException {
    var steps = INC + "," + INC;
    var fixture = withStoppedAt(fixture(steps, "{\"accepted\":true,\"snapshot\":" + ok(1) + "},{\"threw\":\"pub\"}", ok(0)), 1);
    assertDoesNotThrow(() -> replay(new FakeEngine(2), fixture));
    var other = failure(fixture(steps, "{\"accepted\":true,\"snapshot\":" + ok(1) + "},{\"accepted\":true,\"snapshot\":" + ok(2) + "}", ok(0)),
        new FakeEngine(2));
    assertTrue(other.getMessage().contains("esperado un paso sin excepción"), other.getMessage());
  }

  @Test
  void jsonNullProjectionsAreComparedAsNull() throws IOException {
    var nullPublic = "{\"lifecycle\":" + LIFECYCLE + ",\"publicState\":null,\"playerStates\":{\"p1\":{\"seen\":0}},\"finished\":false}";
    var error = failure(fixture(INC, "{\"accepted\":true,\"snapshot\":" + ok(1) + "}", nullPublic));
    assertTrue(error.getMessage().contains("expected.initial.publicState: esperado null, obtenido {"), error.getMessage());
  }

  /** Producción usa NON_NULL ({@code application.yml}): colecciones vacías presentes, nulos ausentes. */
  @Test
  void treeUsesTheProductionInclusion() {
    var tree = GoldenReplayer.tree(new EmptyCollections(List.of(), Map.of(), null));
    assertTrue(tree.get("items") != null && tree.get("items").isArray() && tree.get("items").size() == 0, tree.toString());
    assertTrue(tree.get("scores") != null && tree.get("scores").isObject() && tree.get("scores").size() == 0, tree.toString());
    assertTrue(tree.get("missing") == null, tree.toString());
  }

  private static final String ASSET =
      "{\"kind\":\"asset\",\"assetToken\":\"t\",\"roundNumber\":1,\"assetId\":\"shadow\",\"now\":2000}";

  @Test
  void assetStepComparesTheResolution() throws IOException {
    var original = Optional.of(AssetResolution.original("https://raw.githubusercontent.com/a.png"));
    var fixture = fixture(ASSET,
        "{\"resolution\":{\"source\":\"https://raw.githubusercontent.com/a.png\",\"transform\":\"ORIGINAL\"}}", ok(0));
    assertDoesNotThrow(() -> replay(new FakeEngine(original), fixture));
    var empty = failure(fixture, new FakeEngine(Optional.empty()));
    assertTrue(empty.getMessage().contains("expected.afterSteps[0].resolution"), empty.getMessage());
    assertDoesNotThrow(() -> replay(new FakeEngine(Optional.empty()), fixture(ASSET, "{\"resolution\":null}", ok(0))));
  }

  @Test
  void keyOrderOfProjectionsIsCompared() throws IOException {
    var swapped = "{\"lifecycle\":" + LIFECYCLE + ",\"publicState\":{\"note\":null,\"count\":0},"
        + "\"playerStates\":{\"p1\":{\"seen\":0}},\"finished\":false}";
    var error = failure(fixture(INC, "{\"accepted\":true,\"snapshot\":" + ok(1) + "}", swapped));
    assertTrue(error.getMessage().contains("expected.initial.publicState: orden de claves esperado [note,count] obtenido [count,note]"),
        error.getMessage());
  }

  private static GoldenFixture withStoppedAt(GoldenFixture f, int index) {
    return new GoldenFixture(f.engineId(), f.scenario(), f.seed(), f.catalog(), f.catalogPatch(), f.players(), f.config(),
        f.hostCustomCategories(), f.hostWouldYouRatherPrompts(), f.pokemonVisuals(), f.pokemonAudio(), f.tcgCards(),
        f.startNow(), f.roomCode(), f.steps(), f.expected(), index);
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

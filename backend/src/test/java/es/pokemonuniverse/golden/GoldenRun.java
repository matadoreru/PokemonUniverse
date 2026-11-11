package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Consumer;

/**
 * Una partida de un escenario dorado: los pasos de la fixture sin las aserciones de {@link GoldenReplayer}, para los
 * tests que miran el estado y las proyecciones paso a paso. Las fixtures solo se leen.
 */
public final class GoldenRun {

  private static final ObjectMapper MAPPER = ObjectMapper.getDefault();

  private final GameEngine<Object, Object, Object, Object> engine;
  private final GoldenFixture fixture;
  private GameContext context;
  private Object state;

  /** Estado inicial ({@code createInitialState}) con la configuración dada; falta llamar a {@link #start()}. */
  public GoldenRun(GameEngine<Object, Object, Object, Object> engine, GoldenFixture fixture, PokemonCatalog catalog,
      JsonNode config) {
    this.engine = engine;
    this.fixture = fixture;
    this.context = GoldenContexts.contextFor(fixture, catalog, new Mulberry32(fixture.seed()));
    this.state = engine.createInitialState(engine.parseConfig(config), context);
  }

  /** El escenario {@code golden/<engineId>/<file>} con su propia configuración, aún sin empezar. */
  public static GoldenRun of(String engineId, Path file) {
    var fixture = fixture(file);
    return new GoldenRun(engine(engineId), fixture, GoldenCatalogs.load(fixture.catalog(), fixture.catalogPatch()),
        fixture.config());
  }

  /** El escenario {@code golden/<engineId>/<scenario>.json}, aún sin empezar. */
  public static GoldenRun of(String engineId, String scenario) {
    return of(engineId, root().resolve(engineId).resolve(scenario + ".json"));
  }

  /** Los escenarios del motor (sin {@code config-cases.json}), en orden. */
  public static List<Path> scenarios(String engineId) {
    try (var files = Files.list(root().resolve(engineId))) {
      return files.filter(file -> file.getFileName().toString().endsWith(".json"))
          .filter(file -> !file.getFileName().toString().equals("config-cases.json")).sorted().toList();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /**
   * Juega el escenario entero y llama a {@code visit} con el estado inicial, tras {@code start} y tras cada paso que
   * cambia el estado (los pasos {@code asset} no lo cambian); se detiene donde se detiene la fixture.
   */
  public static void forEachSnapshot(String engineId, Path file, Consumer<GoldenRun> visit) {
    var run = of(engineId, file);
    visit.accept(run);
    run.start();
    visit.accept(run);
    for (var step : run.fixture.steps()) {
      if (!run.step(step)) break;
      if (!"asset".equals(step.kind())) visit.accept(run);
    }
  }

  public static void forEachSnapshot(String engineId, String scenario, Consumer<GoldenRun> visit) {
    forEachSnapshot(engineId, root().resolve(engineId).resolve(scenario + ".json"), visit);
  }

  public void start() {
    state = engine.start(state, context);
  }

  /** {@code false} si el paso detiene la partida (acción inválida o excepción), como {@code stoppedAt}. */
  public boolean step(GoldenFixture.Step step) {
    context = context.withNow(step.now());
    if ("presence".equals(step.kind())) context = context.withPlayers(step.players());
    try {
      switch (step.kind()) {
        case "action" -> state = engine.handleAction(state, step.playerId(), engine.parseAction(step.action()),
            context).state();
        case "timeout" -> state = engine.handleTimeout(state, context);
        case "presence" -> state = engine.handlePresenceChange(state, context);
        default -> { } // "asset": no cambia el estado
      }
      return true;
    } catch (RuntimeException e) { // acción que no valida (ConfigValidationException) o error del motor
      return false;
    }
  }

  public GameEngine<Object, Object, Object, Object> engine() {
    return engine;
  }

  public GoldenFixture fixture() {
    return fixture;
  }

  public GameContext context() {
    return context;
  }

  public Object state() {
    return state;
  }

  /** El estado con su tipo de record; falla si el motor usa otro. */
  public <S> S state(Class<S> type) {
    return type.cast(state);
  }

  public JsonNode lifecycle() {
    return GoldenReplayer.tree(engine.getLifecycle(state));
  }

  public JsonNode publicState() {
    return GoldenReplayer.tree(engine.getPublicState(state, context));
  }

  public JsonNode playerState(String playerId) {
    return GoldenReplayer.tree(engine.getPlayerState(state, playerId, context));
  }

  @SuppressWarnings("unchecked")
  private static GameEngine<Object, Object, Object, Object> engine(String engineId) {
    return (GameEngine<Object, Object, Object, Object>) GoldenEngines.get(engineId)
        .orElseThrow(() -> new IllegalArgumentException("Motor no portado: " + engineId));
  }

  private static GoldenFixture fixture(Path file) {
    try {
      return MAPPER.readValue(Files.readString(file), GoldenFixture.class);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static Path root() {
    try {
      return Path.of(GoldenRun.class.getResource("/golden").toURI());
    } catch (URISyntaxException e) {
      throw new IllegalStateException(e);
    }
  }
}

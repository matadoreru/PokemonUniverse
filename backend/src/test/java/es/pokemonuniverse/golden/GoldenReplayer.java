package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Reproduce una fixture dorada con la misma secuencia de llamadas que {@code runner.ts} y compara cada proyección
 * con lo que grabó TypeScript. El primer desajuste lanza {@link AssertionError} con la ruta JSON.
 *
 * <p>Regla de acciones (igual que producción, {@code rooms/manager.ts}): la acción cruda se valida antes de
 * {@code handleAction}. Si {@code parseAction} lanza {@link ConfigValidationException}, el paso esperado debe ser
 * {@code invalidAction: true} y el escenario se detiene; si TS grabó un snapshot, es un fallo ("la acción cruda no
 * valida en Java pero sí en TS"). Cualquier excepción durante el paso o al calcular su snapshot se compara con
 * {@code threw}; {@code stoppedAt} debe coincidir con el paso que detuvo el escenario.
 */
public final class GoldenReplayer {

  /**
   * Misma inclusión que producción ({@code micronaut.serde.serialization.inclusion: NON_NULL} de
   * {@code application.yml}). {@link ObjectMapper#getDefault()} usa NON_EMPTY y quitaría listas y mapas vacíos que el
   * cable sí envía.
   */
  private static final ObjectMapper MAPPER =
      ObjectMapper.create(Map.of("micronaut.serde.serialization.inclusion", "NON_NULL"));

  private GoldenReplayer() {}

  public static void replay(GameEngine<?, ?, ?, ?> engine, GoldenFixture fixture, PokemonCatalog catalog) {
    run(engine, fixture, catalog);
  }

  private static <C, S, A, P> void run(GameEngine<C, S, A, P> engine, GoldenFixture fixture, PokemonCatalog catalog) {
    var id = fixture.engineId() + "/" + fixture.scenario();
    long startNow = fixture.startNow() != null ? fixture.startNow() : 1000L;
    var players = fixture.players();
    var context = GameContext.builder(catalog, new Mulberry32(fixture.seed()))
        .players(players)
        .now(startNow)
        .roomCode(fixture.roomCode() != null ? fixture.roomCode() : "GOLD01")
        .hostId(players.isEmpty() ? null : players.get(0).id())
        .build();
    var expected = fixture.expected();

    var config = engine.parseConfig(fixture.config());
    compare(id, "expected.configNormalized", expected.configNormalized(), tree(config));
    var state = engine.createInitialState(config, context);
    compareSnapshot(id, "expected.initial", expected.initial(), snapshot(engine, state, context));
    state = engine.start(state, context);
    compareSnapshot(id, "expected.afterStart", expected.afterStart(), snapshot(engine, state, context));

    boolean stopped = false;
    var steps = fixture.steps();
    for (int i = 0; i < steps.size() && !stopped; i++) {
      var step = steps.get(i);
      var path = "expected.afterSteps[" + i + "]";
      if (i >= expected.afterSteps().size()) {
        throw new AssertionError(id + ": " + path + ": esperado <ausente>, obtenido un paso ejecutado");
      }
      var want = expected.afterSteps().get(i);
      if (!List.of("action", "timeout", "presence").contains(step.kind())) {
        throw new IllegalStateException(id + ": paso de tipo desconocido " + step.kind());
      }
      context = context.withNow(step.now());
      if ("presence".equals(step.kind())) context = context.withPlayers(step.players());
      boolean invalid = Boolean.TRUE.equals(want.invalidAction());
      A action = null;
      if ("action".equals(step.kind())) {
        try {
          action = engine.parseAction(step.action());
        } catch (ConfigValidationException e) {
          if (!invalid) {
            throw new AssertionError(id + ": " + path + ": la acción cruda no valida en Java pero sí en TS: "
                + e.getMessage(), e);
          }
          checkStoppedAt(id, fixture, i);
          stopped = true;
          continue;
        }
      }
      if (invalid) {
        throw new AssertionError(id + ": " + path + ".invalidAction: esperado true, obtenido la acción válida en Java");
      }
      Boolean accepted = null;
      String error = null;
      GoldenFixture.Snapshot got;
      try {
        switch (step.kind()) {
          case "action" -> {
            var result = engine.handleAction(state, step.playerId(), action, context);
            state = result.state();
            accepted = result.accepted();
            error = result.error();
          }
          case "timeout" -> state = engine.handleTimeout(state, context);
          default -> state = engine.handlePresenceChange(state, context); // "presence"
        }
        got = snapshot(engine, state, context);
      } catch (Exception thrown) { // runner.ts captura cualquier error; la SPI no declara excepciones comprobadas
        if (want.threw() == null) {
          throw new AssertionError(id + ": " + path + ": esperado un paso sin excepción, lanzó " + thrown, thrown);
        }
        if (!want.threw().equals(thrown.getMessage())) {
          throw new AssertionError(id + ": " + path + ".threw: esperado " + JsonTree.quote(want.threw())
              + ", obtenido " + JsonTree.quote(String.valueOf(thrown.getMessage())), thrown);
        }
        checkStoppedAt(id, fixture, i);
        stopped = true;
        continue;
      }
      if (want.threw() != null) {
        throw new AssertionError(id + ": " + path + ".threw: esperado " + JsonTree.quote(want.threw())
            + ", obtenido <sin excepción>");
      }
      if (!Objects.equals(want.accepted(), accepted)) {
        throw new AssertionError(id + ": " + path + ".accepted: esperado " + want.accepted() + ", obtenido " + accepted);
      }
      if (!Objects.equals(want.error(), error)) {
        throw new AssertionError(id + ": " + path + ".error: esperado " + want.error() + ", obtenido " + error);
      }
      compareSnapshot(id, path + ".snapshot", want.snapshot(), got);
    }

    if (!stopped && fixture.stoppedAt() != null) {
      throw new AssertionError(id + ": stoppedAt: esperado " + fixture.stoppedAt() + ", obtenido <ningún paso se detuvo>");
    }
    if (!stopped && expected.afterSteps().size() != steps.size()) {
      throw new AssertionError(id + ": expected.afterSteps: esperado " + expected.afterSteps().size()
          + " resultados, obtenido " + steps.size());
    }
    boolean wantsResults = expected.results() != null;
    boolean hasResults = !stopped && engine.isFinished(state);
    if (wantsResults != hasResults) {
      throw new AssertionError(id + ": expected.results: esperado "
          + (wantsResults ? "resultados" : "<ausente>") + ", obtenido " + (hasResults ? "resultados" : "<ausente>"));
    }
    if (wantsResults) compare(id, "expected.results", expected.results(), tree(engine.getResults(state)));
  }

  private static void checkStoppedAt(String id, GoldenFixture fixture, int index) {
    if (!Objects.equals(fixture.stoppedAt(), index)) {
      throw new AssertionError(id + ": stoppedAt: esperado " + fixture.stoppedAt() + ", obtenido " + index);
    }
  }

  /** {@code valid}: la normalización coincide con la de TS; si no, {@code parseConfig} lanza {@link ConfigValidationException}. */
  public static void checkConfigCase(GameEngine<?, ?, ?, ?> engine, String id, GoldenFixture.ConfigCase configCase) {
    if (configCase.valid()) {
      Object config;
      try {
        config = engine.parseConfig(configCase.input());
      } catch (ConfigValidationException e) {
        throw new AssertionError(id + ": el motor Java rechazó una configuración válida en TS: " + e.getMessage(), e);
      }
      compare(id, "normalized", configCase.normalized(), tree(config));
    } else {
      try {
        engine.parseConfig(configCase.input());
      } catch (ConfigValidationException expected) {
        return;
      }
      throw new AssertionError(id + ": se esperaba ConfigValidationException y el motor Java aceptó la configuración");
    }
  }

  private static <C, S, A, P> GoldenFixture.Snapshot snapshot(GameEngine<C, S, A, P> engine, S state,
      GameContext context) {
    var playerStates = new LinkedHashMap<String, JsonNode>();
    for (GamePlayer player : context.players()) {
      playerStates.put(player.id(), tree(engine.getPlayerState(state, player.id(), context)));
    }
    return new GoldenFixture.Snapshot(tree(engine.getLifecycle(state)), tree(engine.getPublicState(state, context)),
        JsonNode.createObjectNode(playerStates), engine.isFinished(state));
  }

  private static void compareSnapshot(String id, String path, GoldenFixture.Snapshot want, GoldenFixture.Snapshot got) {
    compare(id, path + ".lifecycle", want.lifecycle(), got.lifecycle());
    compare(id, path + ".publicState", want.publicState(), got.publicState());
    compare(id, path + ".playerStates", want.playerStates(), got.playerStates());
    if (want.finished() != got.finished()) {
      throw new AssertionError(id + ": " + path + ".finished: esperado " + want.finished() + ", obtenido " + got.finished());
    }
  }

  private static void compare(String id, String path, JsonNode want, JsonNode got) {
    var difference = JsonTree.firstDifference(path, JsonTree.canonical(want), JsonTree.canonical(got));
    if (difference.isPresent()) throw new AssertionError(id + ": " + difference.get());
  }

  /**
   * Proyección tal como la vería el cable: el árbol JSON de Serde con la inclusión NON_NULL de producción (nulos
   * omitidos salvo {@code @JsonInclude} propio; colecciones vacías presentes).
   */
  public static JsonNode tree(Object value) {
    try {
      return value == null ? JsonNode.nullNode() : MAPPER.writeValueToTree(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

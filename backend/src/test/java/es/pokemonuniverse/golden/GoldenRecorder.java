package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.json.JsNumbers;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Regenera las fixtures doradas desde los motores Java ({@code ./gradlew test -Dupdate=true --tests '*GoldenReplayTest*'}).
 * Conserva la entrada de cada fixture (jugadores, configuración, pasos y contexto) y vuelve a grabar {@code expected}
 * y {@code stoppedAt} con la misma secuencia de llamadas que {@link GoldenReplayer}. El fichero sale con el formato de
 * {@code JSON.stringify(valor, null, 2)} más salto de línea final (el del antiguo exportador TS), así que regrabar sin
 * cambiar ningún motor no deja diff. Una fixture nueva se escribe a mano sin {@code expected} y se graba igual.
 */
public final class GoldenRecorder {

  private GoldenRecorder() {}

  /** Fixture completa: la entrada de {@code raw} tal cual, y {@code expected}/{@code stoppedAt} grabados de nuevo. */
  public static JsonNode record(GameEngine<?, ?, ?, ?> engine, JsonNode raw, GoldenFixture fixture,
      PokemonCatalog catalog) {
    var recorded = run(engine, fixture, catalog);
    var out = new LinkedHashMap<String, JsonNode>();
    for (Map.Entry<String, JsonNode> entry : raw.entries()) {
      if (!entry.getKey().equals("expected") && !entry.getKey().equals("stoppedAt")) out.put(entry.getKey(), entry.getValue());
    }
    out.put("expected", recorded.expected());
    recorded.stoppedAt().ifPresent(index -> out.put("stoppedAt", JsonNode.createNumberNode(index)));
    return JsonNode.createObjectNode(out);
  }

  private record Recorded(JsonNode expected, Optional<Integer> stoppedAt) {}

  private static <C, S, A, P> Recorded run(GameEngine<C, S, A, P> engine, GoldenFixture fixture,
      PokemonCatalog catalog) {
    var context = GoldenContexts.contextFor(fixture, catalog, new Mulberry32(fixture.seed()));
    var config = engine.parseConfig(fixture.config());
    var expected = new LinkedHashMap<String, JsonNode>();
    expected.put("configNormalized", GoldenReplayer.tree(config));
    var state = engine.createInitialState(config, context);
    expected.put("initial", snapshot(engine, state, context));
    state = engine.start(state, context);
    expected.put("afterStart", snapshot(engine, state, context));

    var afterSteps = new ArrayList<JsonNode>();
    Integer stoppedAt = null;
    var steps = fixture.steps();
    for (int i = 0; i < steps.size(); i++) {
      var step = steps.get(i);
      if (!List.of("action", "timeout", "presence", "asset").contains(step.kind())) {
        throw new IllegalStateException(fixture.engineId() + "/" + fixture.scenario() + ": paso de tipo desconocido "
            + step.kind());
      }
      context = context.withNow(step.now());
      if ("presence".equals(step.kind())) context = context.withPlayers(step.players());
      var result = new LinkedHashMap<String, JsonNode>();
      try {
        switch (step.kind()) {
          case "action" -> {
            A action;
            try {
              action = engine.parseAction(step.action());
            } catch (ConfigValidationException e) {
              // Como producción: la acción cruda que no valida no llega al motor y detiene el escenario.
              result.put("invalidAction", JsonNode.createBooleanNode(true));
              afterSteps.add(JsonNode.createObjectNode(result));
              stoppedAt = i;
              break;
            }
            var handled = engine.handleAction(state, step.playerId(), action, context);
            state = handled.state();
            result.put("accepted", JsonNode.createBooleanNode(handled.accepted()));
            if (handled.error() != null) result.put("error", JsonNode.createStringNode(handled.error()));
            result.put("snapshot", snapshot(engine, state, context));
          }
          case "asset" -> {
            Optional<AssetResolution> resolution = engine.resolveAsset(state,
                new AssetRequest(step.assetToken(), step.roundNumber(), step.assetId()), context);
            result.put("resolution", GoldenReplayer.tree(resolution.orElse(null)));
          }
          case "timeout" -> {
            state = engine.handleTimeout(state, context);
            result.put("snapshot", snapshot(engine, state, context));
          }
          default -> { // "presence"
            state = engine.handlePresenceChange(state, context);
            result.put("snapshot", snapshot(engine, state, context));
          }
        }
      } catch (Exception thrown) { // cualquier error del paso se graba y detiene el escenario
        stoppedAt = threw(afterSteps, thrown, i);
        break;
      }
      if (stoppedAt != null) break;
      afterSteps.add(JsonNode.createObjectNode(result));
    }
    expected.put("afterSteps", JsonNode.createArrayNode(afterSteps));
    if (stoppedAt == null && engine.isFinished(state)) expected.put("results", GoldenReplayer.tree(engine.getResults(state)));
    return new Recorded(JsonNode.createObjectNode(expected), Optional.ofNullable(stoppedAt));
  }

  /** Paso que lanzó: graba el mensaje y detiene el escenario en {@code index}. */
  private static int threw(List<JsonNode> afterSteps, Exception thrown, int index) {
    afterSteps.add(JsonNode.createObjectNode(Map.of("threw", JsonNode.createStringNode(String.valueOf(thrown.getMessage())))));
    return index;
  }

  private static <C, S, A, P> JsonNode snapshot(GameEngine<C, S, A, P> engine, S state, GameContext context) {
    var playerStates = new LinkedHashMap<String, JsonNode>();
    for (GamePlayer player : context.players()) {
      playerStates.put(player.id(), GoldenReplayer.tree(engine.getPlayerState(state, player.id(), context)));
    }
    var snapshot = new LinkedHashMap<String, JsonNode>();
    snapshot.put("lifecycle", GoldenReplayer.tree(engine.getLifecycle(state)));
    snapshot.put("publicState", GoldenReplayer.tree(engine.getPublicState(state, context)));
    snapshot.put("playerStates", JsonNode.createObjectNode(playerStates));
    snapshot.put("finished", JsonNode.createBooleanNode(engine.isFinished(state)));
    return JsonNode.createObjectNode(snapshot);
  }

  /** {@code config-cases.json}: cada entrada con {@code valid} y, si lo es, su {@code normalized}. */
  public static JsonNode recordConfigCases(GameEngine<?, ?, ?, ?> engine, List<GoldenFixture.ConfigCase> cases) {
    var out = new ArrayList<JsonNode>();
    for (var configCase : cases) {
      var entry = new LinkedHashMap<String, JsonNode>();
      entry.put("input", configCase.input());
      try {
        var normalized = GoldenReplayer.tree(engine.parseConfig(configCase.input()));
        entry.put("valid", JsonNode.createBooleanNode(true));
        entry.put("normalized", normalized);
      } catch (ConfigValidationException e) {
        entry.put("valid", JsonNode.createBooleanNode(false));
      }
      out.add(JsonNode.createObjectNode(entry));
    }
    return JsonNode.createArrayNode(out);
  }

  /** {@code JSON.stringify(node, null, 2) + "\n"}: números y cadenas con las reglas de JavaScript. */
  public static String stringify(JsonNode node) {
    var out = new StringBuilder();
    write(node, out, "");
    return out.append('\n').toString();
  }

  private static void write(JsonNode node, StringBuilder out, String indent) {
    if (node == null || node.isNull()) {
      out.append("null");
    } else if (node.isNumber()) {
      out.append(JsNumbers.format(node.getNumberValue()));
    } else if (node.isString()) {
      out.append(JsonTree.quote(node.getStringValue()));
    } else if (node.isBoolean()) {
      out.append(node.getBooleanValue());
    } else if (node.isArray()) {
      if (node.size() == 0) {
        out.append("[]");
        return;
      }
      var inner = indent + "  ";
      out.append("[\n");
      boolean first = true;
      for (JsonNode item : node.values()) {
        if (!first) out.append(",\n");
        first = false;
        out.append(inner);
        write(item, out, inner);
      }
      out.append('\n').append(indent).append(']');
    } else {
      if (node.size() == 0) {
        out.append("{}");
        return;
      }
      var inner = indent + "  ";
      out.append("{\n");
      boolean first = true;
      for (Map.Entry<String, JsonNode> entry : node.entries()) {
        if (!first) out.append(",\n");
        first = false;
        out.append(inner).append(JsonTree.quote(entry.getKey())).append(": ");
        write(entry.getValue(), out, inner);
      }
      out.append('\n').append(indent).append('}');
    }
  }
}

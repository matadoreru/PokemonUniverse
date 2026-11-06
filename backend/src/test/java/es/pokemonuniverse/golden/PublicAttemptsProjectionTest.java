package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/**
 * Ajuste {@code publicAttempts} de los ocho juegos de adivinar con el panel «Intentos públicos». Cada escenario dorado
 * se juega dos veces a la par, con el ajuste encendido y apagado: apagado, la vista pública no lleva ningún fallo y la
 * vista de cada jugador lleva exactamente los suyos; encendido, la vista propia no trae {@code attempts}. Todo lo demás
 * (estado, aleatoriedad, revelación y resultados) es idéntico en las dos partidas.
 */
class PublicAttemptsProjectionTest {

  static final List<String> GAMES = List.of("zoomed-pokemon", "sketchmon", "pokedex-entry-guess", "whos-that-pokemon",
      "pokemon-palette-guess", "pokemon-cry-quiz", "guess-from-stats", "poke-taboo");

  private static final ObjectMapper MAPPER = ObjectMapper.getDefault();

  /** Un test por juego con todos sus escenarios dorados. */
  @TestFactory
  Stream<DynamicTest> hiddenAttemptsOnlyReachTheirOwnPlayer() throws URISyntaxException {
    var root = Path.of(PublicAttemptsProjectionTest.class.getResource("/golden").toURI());
    return GAMES.stream().map(id -> dynamicTest(id, () -> {
      List<Path> scenarios;
      try (var files = Files.list(root.resolve(id))) {
        scenarios = files.filter(file -> file.getFileName().toString().endsWith(".json"))
            .filter(file -> !file.getFileName().toString().equals("config-cases.json")).sorted().toList();
      }
      int misses = 0;
      for (var file : scenarios) misses += check(id + "/" + file.getFileName(), id, file);
      // Que los escenarios ejerciten de verdad el filtrado: algún fallo público con el ajuste encendido.
      assertTrue(misses > 0, id + ": ningún escenario tiene fallos públicos");
    }));
  }

  /** Devuelve el mayor número de fallos públicos que vio la partida encendida. */
  private static int check(String name, String engineId, Path file) throws IOException {
    @SuppressWarnings("unchecked")
    var engine = (GameEngine<Object, Object, Object, Object>) GoldenEngines.get(engineId).orElseThrow();
    var fixture = MAPPER.readValue(Files.readString(file), GoldenFixture.class);
    var catalog = GoldenCatalogs.load(fixture.catalog(), fixture.catalogPatch());
    var shown = new Run(engine, fixture, catalog, withPublicAttempts(fixture.config(), true));
    var hidden = new Run(engine, fixture, catalog, withPublicAttempts(fixture.config(), false));
    int misses = compare(name, shown, hidden);
    for (var step : fixture.steps()) {
      boolean ok = shown.step(step);
      assertEquals(ok, hidden.step(step), name + ": las dos partidas se detienen en el mismo paso");
      if (!ok) break;
      misses = Math.max(misses, compare(name, shown, hidden));
    }
    return misses;
  }

  private static JsonNode withPublicAttempts(JsonNode config, boolean value) {
    var copy = new LinkedHashMap<String, JsonNode>();
    for (var entry : config.entries()) copy.put(entry.getKey(), entry.getValue());
    copy.put("publicAttempts", JsonNode.createBooleanNode(value));
    return JsonNode.createObjectNode(copy);
  }

  /** Devuelve cuántos fallos públicos hay en la partida encendida. */
  private static int compare(String id, Run shown, Run hidden) {
    var shownPublic = shown.publicState();
    var hiddenPublic = hidden.publicState();
    var attempts = shownPublic.get("attempts");
    assertEquals(0, hiddenPublic.get("attempts").size(), id + ": la vista pública apagada no lleva fallos");
    assertTrue(JsonTree.equal(without(shownPublic, "attempts"), without(hiddenPublic, "attempts")),
        id + ": la vista pública solo cambia en attempts");
    for (var player : shown.context.players()) {
      var shownPlayer = shown.playerState(player.id());
      var hiddenPlayer = hidden.playerState(player.id());
      assertNull(shownPlayer.get("attempts"), id + ": encendido, la vista propia no trae attempts");
      var own = new ArrayList<JsonNode>();
      for (var attempt : attempts.values()) {
        if (attempt.get("playerId").getStringValue().equals(player.id())) own.add(attempt);
      }
      // Quien dibuja, describe u observa en Sketchmon y PokéTaboo no tiene campo attempts (no puede fallar).
      var received = hiddenPlayer.get("attempts");
      boolean turnBased = id.startsWith("sketchmon/") || id.startsWith("poke-taboo/");
      if (received == null && own.isEmpty() && turnBased
          && !"GUESSER".equals(hiddenPlayer.get("role").getStringValue())) {
        received = JsonNode.createArrayNode(List.of());
      }
      assertTrue(JsonTree.equal(JsonNode.createArrayNode(own), received),
          id + ": apagado, " + player.id() + " recibe exactamente sus fallos");
      assertTrue(JsonTree.equal(shownPlayer, without(hiddenPlayer, "attempts")),
          id + ": la vista propia solo cambia en attempts");
    }
    return attempts.size();
  }

  private static JsonNode without(JsonNode object, String key) {
    var copy = new LinkedHashMap<String, JsonNode>();
    for (var entry : object.entries()) if (!entry.getKey().equals(key)) copy.put(entry.getKey(), entry.getValue());
    return JsonNode.createObjectNode(copy);
  }

  /** Una partida del escenario: los pasos de la fixture sin las aserciones de {@link GoldenReplayer}. */
  private static final class Run {
    private final GameEngine<Object, Object, Object, Object> engine;
    private GameContext context;
    private Object state;

    Run(GameEngine<Object, Object, Object, Object> engine, GoldenFixture fixture,
        PokemonCatalog catalog, JsonNode config) {
      this.engine = engine;
      this.context = GoldenContexts.contextFor(fixture, catalog, new Mulberry32(fixture.seed()));
      this.state = engine.start(engine.createInitialState(engine.parseConfig(config), context), context);
    }

    /** {@code false} si el paso detiene la partida (acción inválida o excepción), como {@code stoppedAt}. */
    boolean step(GoldenFixture.Step step) {
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

    JsonNode publicState() {
      return GoldenReplayer.tree(engine.getPublicState(state, context));
    }

    JsonNode playerState(String playerId) {
      return GoldenReplayer.tree(engine.getPlayerState(state, playerId, context));
    }
  }
}

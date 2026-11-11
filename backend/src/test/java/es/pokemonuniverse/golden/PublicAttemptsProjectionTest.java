package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.json.JsonTree;
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
 * vista de cada jugador lleva exactamente los suyos (quien dibuja o describe, todos); encendido, la vista propia no trae {@code attempts}. Todo lo demás
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
    var shown = new GoldenRun(engine, fixture, catalog, withPublicAttempts(fixture.config(), true));
    var hidden = new GoldenRun(engine, fixture, catalog, withPublicAttempts(fixture.config(), false));
    shown.start();
    hidden.start();
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
  private static int compare(String id, GoldenRun shown, GoldenRun hidden) {
    var shownPublic = shown.publicState();
    var hiddenPublic = hidden.publicState();
    var attempts = shownPublic.get("attempts");
    assertEquals(0, hiddenPublic.get("attempts").size(), id + ": la vista pública apagada no lleva fallos");
    assertTrue(JsonTree.equal(without(shownPublic, "attempts"), without(hiddenPublic, "attempts")),
        id + ": la vista pública solo cambia en attempts");
    for (var player : shown.context().players()) {
      var shownPlayer = shown.playerState(player.id());
      var hiddenPlayer = hidden.playerState(player.id());
      assertNull(shownPlayer.get("attempts"), id + ": encendido, la vista propia no trae attempts");
      var roleNode = hiddenPlayer.get("role"); // los otros juegos no tienen roles
      var hiddenRole = roleNode == null ? "" : roleNode.getStringValue();
      // Quien dibuja o describe (Sketchmon, PokéTaboo) ve los fallos de todos aunque el ajuste esté apagado.
      boolean guide = "DRAWER".equals(hiddenRole) || "DESCRIPTOR".equals(hiddenRole);
      var expected = new ArrayList<JsonNode>();
      for (var attempt : attempts.values()) {
        if (guide || attempt.get("playerId").getStringValue().equals(player.id())) expected.add(attempt);
      }
      if ("SPECTATOR".equals(hiddenRole) && (id.startsWith("sketchmon/") || id.startsWith("poke-taboo/"))) {
        assertNull(hiddenPlayer.get("attempts"), id + ": el espectador no recibe intentos");
      } else {
        assertTrue(JsonTree.equal(JsonNode.createArrayNode(expected), hiddenPlayer.get("attempts")),
            id + ": apagado, " + player.id() + " recibe " + (guide ? "todos los fallos" : "exactamente sus fallos"));
      }
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
}

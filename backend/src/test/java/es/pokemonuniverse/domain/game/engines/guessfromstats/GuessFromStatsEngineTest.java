package es.pokemonuniverse.domain.game.engines.guessfromstats;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, configuración por defecto, parseo y errores de arranque. */
class GuessFromStatsEngineTest {

  private final GuessFromStatsEngine engine = new GuessFromStatsEngine(GoldenManifests.of(GuessFromStatsEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000).build();
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("guess-from-stats", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new GuessFromStatsEngine(other));
  }

  @Test
  void parsesTheStrictGuessAction() throws IOException {
    var longest = "x".repeat(96);
    assertEquals(longest,
        engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "\"}")).pokemonId());
    for (var invalid : List.of("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":25}", "{\"type\":\"ANSWER\",\"pokemonId\":\"pikachu\"}", "[]",
        "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsTwoPlayersAndAPoolOfAtLeastTwo() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(engine.defaultConfig(), context(1)));
    assertEquals("Se necesitan al menos 2 jugadores.", error.getMessage());
    var defaults = engine.defaultConfig();
    var empty = new GuessFromStatsConfig(List.of(9), 30, 3, defaults.stats(), false, defaults.hints(), true);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(empty, context(2)));
    assertEquals("No hay suficientes Pokémon con estadísticas válidas para esta configuración.", error.getMessage());
  }

  @Test
  void startsOnlyOnceAndPreloadsEachRoundSprite() {
    var preloaded = new ArrayList<String>();
    var context = context(2).toBuilder().preloadImage(preloaded::add).build();
    var started = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    assertEquals(engine.defaultConfig().rounds(), preloaded.size());
    var error = assertThrows(EngineException.class, () -> engine.start(started, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
    // Sin preloadImage (opcional en el contexto) la baraja se prepara igual.
    var withoutPreload = context(2);
    engine.createInitialState(engine.defaultConfig(), withoutPreload);
  }

  /** Estados que el flujo público no produce: la baraja no tiene la ronda en curso. */
  @Test
  void returnsTheServerLiteralsWhenTheRoundIsMissingFromTheDeck() {
    var context = context(2);
    var missing = GuessFromStatsTypes.GuessFromStatsState.builder().phase(GamePhase.ROUND_ACTIVE)
        .config(engine.defaultConfig()).playerIds(List.of("p1", "p2")).poolIds(List.of("pikachu")).roundNumber(1)
        .roundStartedAt(1000L).roundEndsAt(31_000L).build();
    var result = engine.handleAction(missing, "p1", new GuessFromStatsTypes.GuessFromStatsAction("pikachu"), context);
    assertEquals("La respuesta no está disponible.", result.error());
    var error = assertThrows(EngineException.class, () -> engine.handleTimeout(missing, context.withNow(31_000)));
    assertEquals("La ronda ya no está disponible.", error.getMessage());
    var finished = missing.toBuilder().phase(GamePhase.ROUND_RESULTS).roundNumber(0).roundEndsAt(null)
        .nextTransitionAt(5_000L).build();
    error = assertThrows(EngineException.class, () -> engine.handleTimeout(finished, context.withNow(5_000)));
    assertEquals("No se pudo preparar la siguiente ronda de estadísticas.", error.getMessage());
  }
}

package es.pokemonuniverse.domain.game.engines.pokemonpaletteguess;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokemonpaletteguess.PokemonPaletteGuessTypes.PokemonPaletteGuessState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenFixture.PalettePatch;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, configuración por defecto, parseo y errores de arranque. */
class PokemonPaletteGuessEngineTest {

  private static final List<String> COLORS =
      List.of("#f8d030", "#a1871f", "#c03028", "#fae078", "#383838", "#f8f8f8", "#e0a000", "#704010");

  private final PokemonPaletteGuessEngine engine =
      new PokemonPaletteGuessEngine(GoldenManifests.of(PokemonPaletteGuessEngine.ID));

  private static GameContext context(PokemonCatalog catalog) {
    return GameContext.builder(catalog, new Mulberry32(1)).players(List.of(new GamePlayer("p1", "Ana"))).now(1000)
        .build();
  }

  private static PokemonCatalog patched() {
    return GoldenCatalogs.load("gen1-2",
        Map.of("pikachu", new PalettePatch(COLORS, List.of(4.0, 4.0, 2.0, 2.0, 1.0, 1.0, 1.0, 1.0))));
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokemon-palette-guess", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokemonPaletteGuessEngine(other));
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

  /** El catálogo exportado no trae paletas: sin parche no hay pool. */
  @Test
  void needsPersistedPalettes() {
    var error = assertThrows(EngineException.class,
        () -> engine.createInitialState(engine.defaultConfig(), context(GoldenCatalogs.load("gen1-2"))));
    assertEquals("No hay suficientes paletas en PostgreSQL para las generaciones y tamaño seleccionados. Ejecuta la "
        + "sincronización Pokémon.", error.getMessage());
  }

  @Test
  void startsOnlyOnceAndNormalizesTheVisibleWeights() {
    var context = context(patched());
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    assertEquals("pikachu", state.targetPokemonId());
    var error = assertThrows(EngineException.class, () -> engine.start(state, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
    var visible = PokemonPaletteGuessEngine.visiblePalette(context.pokemon().byId("pikachu").orElseThrow(), 5);
    assertEquals(COLORS.subList(0, 5), visible.colors());
    assertEquals(List.of(4.0 / 13, 4.0 / 13, 2.0 / 13, 2.0 / 13, 1.0 / 13), visible.weights());
  }

  /** Estados que el flujo público no produce: pool vacío y objetivo sin paleta. */
  @Test
  void throwsTheServerLiteralsForUnreachableStates() {
    var context = context(patched());
    var empty = PokemonPaletteGuessState.builder().phase(GamePhase.GAME_STARTING).config(engine.defaultConfig())
        .playerIds(List.of("p1")).build();
    var error = assertThrows(EngineException.class, () -> engine.start(empty, context));
    assertEquals("No hay paletas persistidas para esta configuración.", error.getMessage());
    var stale = PokemonPaletteGuessState.builder().phase(GamePhase.ROUND_ACTIVE).config(engine.defaultConfig())
        .playerIds(List.of("p1")).poolIds(List.of("pikachu")).roundNumber(1).targetPokemonId("raichu")
        .roundStartedAt(1000L).roundEndsAt(26_000L).build();
    error = assertThrows(EngineException.class, () -> engine.handleTimeout(stale, context.withNow(26_000)));
    assertEquals("La paleta objetivo ya no está disponible.", error.getMessage());
  }
}

package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import static es.pokemonuniverse.support.EngineTestKit.context;
import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.PokemonBingoAction;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.PokemonBingoState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionGenerationOptions;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import es.pokemonuniverse.golden.GoldenRun;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.BiConsumer;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, parseo y errores de arranque (el exportador no los graba); y la
 * privacidad de soluciones e intentos, comprobada paso a paso sobre los escenarios dorados. La vista pública lleva el
 * tablero de cada jugador (condiciones y Pokémon colocados); cada jugador tiene un tablero distinto.
 */
class PokemonBingoEngineTest {

  private final PokemonBingoEngine engine = new PokemonBingoEngine(GoldenManifests.of(PokemonBingoEngine.ID));

  private static PokemonBingoConfig withFamilies(PokemonBingoConfig base, int width, int height,
      List<Integer> generations, String onlyFamily) {
    var families = new LinkedHashMap<String, Boolean>();
    for (var key : ConditionGenerationOptions.BINGO_FAMILY_KEYS) families.put(key, key.equals(onlyFamily));
    return new PokemonBingoConfig(width, height, base.durationSeconds(), generations, base.maxConditionsPerCell(),
        families);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokemon-bingo", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokemonBingoEngine(other));
  }

  @Test
  void parsesTheStrictActions() throws IOException {
    assertInstanceOf(PokemonBingoAction.SkipResults.class, engine.parseAction(json("{\"type\":\"SKIP_RESULTS\"}")));
    var id64 = "c".repeat(64);
    var assign = assertInstanceOf(PokemonBingoAction.AssignPokemon.class, engine.parseAction(
        json("{\"type\":\"ASSIGN_POKEMON\",\"cellId\":\"" + id64 + "\",\"pokemonId\":\"zubat\"}")));
    assertEquals(id64, assign.cellId());
    assertFalse(assign.moveExisting());
    assertTrue(assertInstanceOf(PokemonBingoAction.AssignPokemon.class, engine.parseAction(json(
        "{\"type\":\"ASSIGN_POKEMON\",\"cellId\":\"cell-1\",\"pokemonId\":\"zubat\",\"moveExisting\":true}")))
        .moveExisting());
    assertEquals(new PokemonBingoAction.MovePokemon("cell-1", "cell-2"), engine.parseAction(
        json("{\"type\":\"MOVE_POKEMON\",\"fromCellId\":\"cell-1\",\"toCellId\":\"cell-2\"}")));
    assertEquals(new PokemonBingoAction.RemovePokemon("cell-3"),
        engine.parseAction(json("{\"type\":\"REMOVE_POKEMON\",\"cellId\":\"cell-3\"}")));
    for (var invalid : List.of("{\"type\":\"SKIP_RESULTS\",\"extra\":1}",
        "{\"type\":\"ASSIGN_POKEMON\",\"cellId\":\"cell-1\",\"pokemonId\":\"\"}",
        "{\"type\":\"ASSIGN_POKEMON\",\"cellId\":\"" + id64 + "c\",\"pokemonId\":\"zubat\"}",
        "{\"type\":\"ASSIGN_POKEMON\",\"cellId\":\"cell-1\",\"pokemonId\":\"zubat\",\"moveExisting\":\"yes\"}",
        "{\"type\":\"ASSIGN_POKEMON\",\"cellId\":\"cell-1\",\"pokemonId\":\"zubat\",\"moveExisting\":null}",
        "{\"type\":\"ASSIGN_POKEMON\",\"cellId\":\"cell-1\"}",
        "{\"type\":\"MOVE_POKEMON\",\"fromCellId\":\"cell-1\"}",
        "{\"type\":\"MOVE_POKEMON\",\"fromCellId\":\"cell-1\",\"toCellId\":2}",
        "{\"type\":\"REMOVE_POKEMON\",\"cellId\":\"\"}", "{\"type\":\"REMOVE_POKEMON\",\"cellId\":\"a\",\"x\":1}",
        "{\"type\":\"skip_results\"}", "{\"cellId\":\"cell-1\"}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void startErrorsKeepTheTsLiterals() {
    var defaults = engine.defaultConfig();
    var noFamilies = withFamilies(defaults, 3, 3, List.of(1), "none");
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(noFamilies, context(1)));
    assertEquals("Selecciona al menos una familia de condiciones.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.createInitialState(defaults, context(0)));
    assertEquals("Se necesitan al menos 1 jugadores.", error.getMessage());
    var emptyPool = new PokemonBingoConfig(3, 3, 120, List.of(9), 1, defaults.families());
    error = assertThrows(EngineException.class, () -> engine.createInitialState(emptyPool, context(1)));
    assertEquals("No se puede generar un tablero 3×3: el pool solo contiene 0 Pokémon válidos.", error.getMessage());
    var fewTemplates = withFamilies(defaults, 6, 6, List.of(1), "typeCount");
    error = assertThrows(EngineException.class, () -> engine.createInitialState(fewTemplates, context(1)));
    assertEquals("No se puede generar un tablero 6×6: solo hay 2 condiciones distintas válidas.", error.getMessage());
  }

  @Test
  void spectatorsCannotAct() {
    var context = context(2);
    var state = engine.start(engine.createInitialState(engine.defaultConfig(), context), context);
    var spectator = engine.getPlayerState(state, "p9", context);
    assertFalse(spectator.canAct());
    assertEquals(null, spectator.cooldownUntil());
    assertTrue(engine.getPlayerState(state, "p1", context).canAct());
  }

  /** El emparejamiento del servidor no sale nunca; las posibles soluciones solo llegan con los resultados. */
  @Test
  void solutionsStayHiddenUntilTheEnd() {
    int[] revealed = {0};
    forEachState((state, run) -> {
      var cells = engine.getPublicState(state, run.context()).boards().values().stream()
          .flatMap(board -> board.cells().stream()).toList();
      if (state.phase() == GamePhase.GAME_RESULTS) {
        revealed[0] += (int) cells.stream().filter(cell -> !cell.possibleSolutions().isEmpty()).count();
      } else {
        assertTrue(cells.stream().allMatch(cell -> cell.possibleSolutions().isEmpty()), state.phase().name());
      }
    });
    assertTrue(revealed[0] > 0, "algún escenario revela soluciones al terminar");
  }

  /** El último intento (con su Pokémon y su mensaje) solo llega a quien lo hizo; un fallo no aparece en su tablero. */
  @Test
  void privateAttemptsOnlyReachTheirPlayer() {
    int[] misses = {0};
    forEachState((state, run) -> {
      var publicState = engine.getPublicState(state, run.context());
      for (var playerId : state.playerIds()) {
        var attempt = state.lastAttempts().get(playerId);
        assertEquals(attempt, engine.getPlayerState(state, playerId, run.context()).lastAttempt(), playerId);
        if (attempt == null || attempt.correct()) continue;
        misses[0]++;
        var cell = publicState.boards().get(playerId).cells().stream()
            .filter(candidate -> candidate.id().equals(attempt.cellId())).findFirst().orElseThrow();
        assertFalse(cell.assignment() != null && cell.assignment().id().equals(attempt.pokemonId()),
            "el fallo de " + playerId + " no se coloca en su tablero público");
      }
    });
    assertTrue(misses[0] > 0, "algún escenario tiene un intento fallido");
  }

  /** Recorre los estados de los escenarios dorados. */
  private static void forEachState(BiConsumer<PokemonBingoState, GoldenRun> check) {
    for (var file : GoldenRun.scenarios(PokemonBingoEngine.ID)) {
      GoldenRun.forEachSnapshot(PokemonBingoEngine.ID, file, run -> check.accept(run.state(PokemonBingoState.class),
          run));
    }
  }
}

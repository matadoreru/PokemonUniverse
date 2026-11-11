package es.pokemonuniverse.domain.game.engines.pokeddlerace;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.EvolutionValue;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleFeedbackEntry;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleRaceState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.domain.pokemon.PokemonEvolutionLink;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import es.pokemonuniverse.golden.GoldenRun;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, parseo y errores de arranque; y que el Pokémon secreto de cada
 * tablero solo se revele al resolverlo o al terminar, comprobado paso a paso sobre los escenarios dorados.
 */
class PokeddleRaceEngineTest {

  private final PokeddleRaceEngine engine = new PokeddleRaceEngine(GoldenManifests.of(PokeddleRaceEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    return context(players, GoldenCatalogs.load("gen1-2"));
  }

  private static GameContext context(int players, PokemonCatalog catalog) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(catalog, new Mulberry32(1)).players(list).now(1000).build();
  }

  private static PokeddleRaceConfig withGenerations(List<Integer> generations) {
    var defaults = PokeddleRaceConfig.defaults();
    return new PokeddleRaceConfig(generations, defaults.roundSeconds(), defaults.maxRounds(), defaults.clues());
  }

  /** Etapas de la partida tal como las fija {@code createInitialState} para esas generaciones. */
  private Map<String, EvolutionValue> evolutions(List<Integer> generations, PokemonCatalog catalog) {
    return engine.createInitialState(withGenerations(generations), context(2, catalog)).evolutions();
  }

  private static Pokemon pokemon(String id, int dex, int generation, int stage, int stages) {
    return new Pokemon(id, dex, id, generation, true, "s", null, null, null, 1, 1, 1, 1, 1, 1, 6, 1, 1, stage, stages,
        "NORMAL", "red", List.of("a"), Map.of(), List.of("fire"));
  }

  /** Magby (2.ª) → Magmar (1.ª) → Magmortar (4.ª), con las etapas que siembra el catálogo completo. */
  private static InMemoryPokemonCatalog magmarFamily() {
    return new InMemoryPokemonCatalog(
        List.of(pokemon("magmar", 126, 1, 2, 3), pokemon("magby", 240, 2, 1, 3), pokemon("magmortar", 467, 4, 3, 3)),
        List.of(), List.of(), Map.of(), List.of(),
        List.of(new PokemonEvolutionLink("magby", "magmar"), new PokemonEvolutionLink("magmar", "magmortar")));
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokeddle-race", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokeddleRaceEngine(other));
  }

  @Test
  void parsesTheStrictGuessAction() throws IOException {
    var longest = "x".repeat(64);
    assertEquals(longest,
        engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "\"}")).pokemonId());
    for (var invalid : List.of("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"pikachu\",\"extra\":1}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + longest + "x\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":25}", "{\"type\":\"SUBMIT_POKEMON\",\"pokemonId\":\"pikachu\"}",
        "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void needsTheManifestPlayersOneClueAndACompletePool() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context(1)));
    assertEquals("Se necesitan al menos " + engine.manifest().minPlayers() + " jugadores.", error.getMessage());
    // Sin pistas la configuración valida (el esquema no lo impide), pero la partida no arranca.
    var clues = new LinkedHashMap<String, Boolean>();
    for (var key : PokeddleRaceConfig.CLUE_KEYS) clues.put(key, false);
    var noClues = new PokeddleRaceConfig(List.of(1), 20, 10, clues);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(noClues, context(2)));
    assertEquals("Selecciona al menos una pista.", error.getMessage());
    var emptyPool = new PokeddleRaceConfig(List.of(9), 20, 10, engine.defaultConfig().clues());
    error = assertThrows(EngineException.class, () -> engine.createInitialState(emptyPool, context(2)));
    assertEquals("No hay Pokémon con datos completos para esta configuración.", error.getMessage());
  }

  @Test
  void comparesTypesAsSets() {
    assertEquals("EXACT", PokeddleRaceRules.comparePokeddleTypes(List.of("fire", "fire"), List.of("fire")));
    assertEquals("PARTIAL", PokeddleRaceRules.comparePokeddleTypes(List.of("fire", "flying"), List.of("fire")));
    assertEquals("NONE", PokeddleRaceRules.comparePokeddleTypes(List.of("water"), List.of("fire")));
  }

  @Test
  void countsOnlyTheChosenGenerationsInTheEvolutionStage() {
    var gen1 = evolutions(List.of(1), GoldenCatalogs.load("gen1-2"));
    assertEquals(new EvolutionValue(1, 2), gen1.get("pikachu"));
    assertEquals(new EvolutionValue(2, 2), gen1.get("raichu"));
    assertEquals(new EvolutionValue(1, 2), gen1.get("zubat"));
    assertEquals(new EvolutionValue(2, 2), gen1.get("golbat"));
    assertEquals(new EvolutionValue(1, 2), gen1.get("clefairy"));
    assertEquals(new EvolutionValue(1, 1), gen1.get("chansey"));
    assertEquals(new EvolutionValue(2, 3), gen1.get("charmeleon"));
    assertEquals(new EvolutionValue(3, 3), gen1.get("vileplume"));
  }

  @Test
  void skipsAncestorsOutsideTheChosenGenerations() {
    var gen14 = evolutions(List.of(1, 4), magmarFamily());
    assertEquals(new EvolutionValue(1, 2), gen14.get("magmar"));
    assertEquals(new EvolutionValue(2, 2), gen14.get("magmortar"));
    assertEquals(new EvolutionValue(1, 1), evolutions(List.of(1), magmarFamily()).get("magmar"));
  }

  @Test
  void withoutLinksForAPokemonItKeepsItsStoredStage() {
    // Si faltaran las aristas (tabla vacía), no se pinta 1/1 para todos: se usa la etapa sembrada.
    var noLinks = new InMemoryPokemonCatalog(
        List.of(pokemon("magmar", 126, 1, 2, 3), pokemon("magby", 240, 2, 1, 3), pokemon("magmortar", 467, 4, 3, 3)),
        List.of(), List.of(), Map.of(), List.of(), List.of());
    assertEquals(new EvolutionValue(2, 3), evolutions(List.of(1), noLinks).get("magmar"));
  }

  @Test
  void keepsTheCatalogStagesWhenTheWholeFamilyIsChosen() {
    var all = evolutions(List.of(1, 2, 4), magmarFamily());
    assertEquals(new EvolutionValue(1, 3), all.get("magby"));
    assertEquals(new EvolutionValue(2, 3), all.get("magmar"));
    assertEquals(new EvolutionValue(3, 3), all.get("magmortar"));
    // En la fixture de 1.ª y 2.ª, las familias que no salen de ellas conservan su etapa sembrada (Bellossom y
    // Vileplume son finales de rama).
    var catalog = GoldenCatalogs.load("gen1-2");
    var gen12 = evolutions(List.of(1, 2), catalog);
    for (var id : List.of("pichu", "pikachu", "raichu", "zubat", "golbat", "crobat", "oddish", "gloom", "vileplume",
        "bellossom", "eevee", "espeon", "bulbasaur")) {
      var stored = catalog.evolutionInfo(id).orElseThrow();
      assertEquals(new EvolutionValue(stored.stage(), stored.stages()), gen12.get(id), id);
    }
  }

  @Test
  void greenNeedsTheSameStageAndTotal() {
    assertEquals("PARTIAL", PokeddleRaceRules.comparePokeddleEvolution(new EvolutionValue(1, 1),
        new EvolutionValue(1, 3)));
    assertEquals("MATCH", PokeddleRaceRules.comparePokeddleEvolution(new EvolutionValue(2, 3),
        new EvolutionValue(2, 3)));
    assertEquals("HIGHER", PokeddleRaceRules.comparePokeddleEvolution(new EvolutionValue(1, 2),
        new EvolutionValue(2, 3)));
    assertEquals("LOWER", PokeddleRaceRules.comparePokeddleEvolution(new EvolutionValue(3, 3),
        new EvolutionValue(2, 3)));
  }

  @Test
  void theEvolutionClueUsesTheGameStages() {
    var catalog = GoldenCatalogs.load("gen1-2");
    var config = withGenerations(List.of(1));
    var evolutions = engine.createInitialState(config, context(2, catalog)).evolutions();
    var chansey = catalog.byId("chansey").orElseThrow();
    var clefairy = catalog.byId("clefairy").orElseThrow();
    var feedback = PokeddleRaceRules.buildPokeddleFeedback(chansey, clefairy, config, evolutions);
    assertEquals(new PokeddleFeedbackEntry.Evolution(new EvolutionValue(1, 1), "PARTIAL"),
        feedback.get("evolutionStage"));
  }

  /** El tablero público revela su Pokémon secreto cuando su jugador lo resuelve o acaba la partida; antes, nunca. */
  @Test
  void aSecretIsRevealedOnlyOnceItsBoardIsSolved() {
    int[] hidden = {0};
    for (var file : GoldenRun.scenarios(PokeddleRaceEngine.ID)) {
      GoldenRun.forEachSnapshot(PokeddleRaceEngine.ID, file, run -> {
        var state = run.state(PokeddleRaceState.class);
        var boards = engine.getPublicState(state, run.context()).boards();
        for (var playerId : state.playerIds()) {
          var revealed = boards.get(playerId).revealedPokemon();
          if (state.solved().containsKey(playerId) || state.phase() == GamePhase.GAME_RESULTS) {
            assertEquals(state.secretPokemonIds().get(playerId), revealed.id(), playerId);
          } else {
            assertNull(revealed, playerId + " en " + state.phase());
            if (state.phase() == GamePhase.ROUND_RESULTS) hidden[0]++;
          }
        }
      });
    }
    assertTrue(hidden[0] > 0, "algún tablero sigue sin resolver al cerrar una ronda");
  }
}

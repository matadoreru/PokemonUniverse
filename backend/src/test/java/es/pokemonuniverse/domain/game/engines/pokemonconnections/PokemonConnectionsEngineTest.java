package es.pokemonuniverse.domain.game.engines.pokemonconnections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.PuzzleOptions;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.ConnectionPokemon;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsAction;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsTypes.PokemonConnectionsPlayerState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleSupplier;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * Lo que las fixtures doradas no cubren: manifiesto, parseo, errores inalcanzables por la API y la rama curada de
 * {@code generateConnectionsPuzzle}, que con {@code gen1-2} nunca tiene candidatas (todas las plantillas piden algún
 * Pokémon de gen 3+). Los valores esperados de la rama curada salen de {@code generateConnectionsPuzzle} del dist de
 * shared con el mismo catálogo sintético y la misma fuente de azar.
 */
class PokemonConnectionsEngineTest {

  private final PokemonConnectionsEngine engine =
      new PokemonConnectionsEngine(GoldenManifests.of(PokemonConnectionsEngine.ID));

  /** Los 16 Pokémon de la plantilla {@code classic-connections}, en ese orden. */
  private static final List<String> CLASSIC_IDS = List.of("vaporeon", "jolteon", "flareon", "espeon", "omanyte",
      "kabuto", "aerodactyl", "lileep", "growlithe", "houndour", "electrike", "lillipup", "vanillite", "slurpuff",
      "appletun", "alcremie");

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  /** Mismo pool sintético que el script TS: tipos alternos Agua/Fuego y defensas 50–52. */
  private static InMemoryPokemonCatalog classicCatalog() {
    var pool = new ArrayList<Pokemon>();
    for (int index = 0; index < CLASSIC_IDS.size(); index++) {
      var id = CLASSIC_IDS.get(index);
      pool.add(new Pokemon(id, 1000 + index, id.toUpperCase(), 1, true, "/s/" + id + ".png", "", null, null, 50, 50,
          50 + index % 3, 50, 50, 50, 350, 1, 1, null, null, "NORMAL", "green", List.of(), Map.of(),
          List.of(index % 2 == 0 ? "water" : "fire")));
    }
    return new InMemoryPokemonCatalog(pool);
  }

  private static GameContext context(DoubleSupplier random) {
    return GameContext.builder(classicCatalog(), random).players(List.of(new GamePlayer("p1", "Ana"))).now(1000)
        .build();
  }

  private static String describe(PokemonConnectionsCatalog.GeneratedConnectionsPuzzle puzzle) {
    return puzzle.source() + " " + puzzle.key() + " | " + puzzle.groups().stream()
        .map(group -> group.id() + ":" + group.pokemon().stream().map(ConnectionPokemon::id)
            .collect(Collectors.joining(",")))
        .collect(Collectors.joining(" "));
  }

  private static PuzzleOptions options(int pokemonCount, List<String> used, List<String> excluded) {
    return new PuzzleOptions(4, pokemonCount, List.of(1), used, excluded);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("pokemon-connections", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokemonConnectionsEngine(other));
  }

  @Test
  void parsesIntegralDoublesInTheConfig() throws IOException {
    // Las fixtures no pueden llevar 16.0: JSON.stringify lo escribe como 16.
    var parsed = engine.parseConfig(json("{\"generations\":[2.0,1,2],\"groupSize\":4.0,\"pokemonCount\":16.0,"
        + "\"mistakesAllowed\":4.0,\"roundSeconds\":120.0,\"rounds\":5.0}"));
    assertEquals(PokemonConnectionsConfig.builder().generations(List.of(1, 2)).groupSize(4).pokemonCount(16)
        .mistakesAllowed(4).roundSeconds(120).rounds(5).build(), parsed);
    var base = "\"generations\":[1],\"mistakesAllowed\":4,\"roundSeconds\":120,";
    for (var invalid : List.of("{" + base + "\"groupSize\":4,\"pokemonCount\":16.5,\"rounds\":5}",
        "{" + base + "\"groupSize\":4,\"pokemonCount\":16,\"rounds\":1e20}",
        "{" + base + "\"groupSize\":4,\"pokemonCount\":16,\"rounds\":9007199254740991}",
        "{" + base + "\"groupSize\":4,\"pokemonCount\":28,\"rounds\":5}")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseConfig(json(invalid)), invalid);
    }
  }

  @Test
  void parsesTheStrictActions() throws IOException {
    var id96 = "p".repeat(96);
    var submit = assertInstanceOf(PokemonConnectionsAction.SubmitGroup.class, engine.parseAction(
        json("{\"type\":\"SUBMIT_GROUP\",\"pokemonIds\":[\"b\",\"a\",\"b\",\"" + id96 + "\",\"c\"]}")));
    assertEquals(List.of("b", "a", "b", id96, "c"), submit.pokemonIds());
    assertInstanceOf(PokemonConnectionsAction.AdvanceRound.class,
        engine.parseAction(json("{\"type\":\"ADVANCE_ROUND\"}")));
    for (var invalid : List.of("{\"type\":\"SUBMIT_GROUP\",\"pokemonIds\":[\"a\",\"b\"]}",
        "{\"type\":\"SUBMIT_GROUP\",\"pokemonIds\":[\"a\",\"b\",\"c\",\"d\",\"e\",\"f\"]}",
        "{\"type\":\"SUBMIT_GROUP\",\"pokemonIds\":[\"a\",\"b\",\"\"]}",
        "{\"type\":\"SUBMIT_GROUP\",\"pokemonIds\":[\"a\",\"b\",\"" + id96 + "p\"]}",
        "{\"type\":\"SUBMIT_GROUP\",\"pokemonIds\":[\"a\",\"b\",3]}",
        "{\"type\":\"SUBMIT_GROUP\",\"pokemonIds\":\"abc\"}", "{\"type\":\"SUBMIT_GROUP\"}",
        "{\"type\":\"SUBMIT_GROUP\",\"pokemonIds\":[\"a\",\"b\",\"c\"],\"extra\":1}",
        "{\"type\":\"ADVANCE_ROUND\",\"pokemonIds\":[]}", "{\"type\":\"advance_round\"}", "{}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  @Test
  void unreachableErrorsKeepTheTsLiterals() {
    var error = assertThrows(EngineException.class, () -> PokemonConnectionsRules.completionBonus(0));
    assertEquals("Invalid completion rank", error.getMessage());
    assertEquals(0, PokemonConnectionsRules.completionBonus(4));
    var context = context(() -> 0.1);
    error = assertThrows(EngineException.class, () -> PokemonConnectionsCatalog.generateConnectionsPuzzle(context,
        new PuzzleOptions(4, 18, List.of(1), List.of(), List.of())));
    assertEquals("El tamaño del tablero no forma grupos completos.", error.getMessage());
    error = assertThrows(EngineException.class, () -> PokemonConnectionsCatalog.generateConnectionsPuzzle(
        context(new Mulberry32(3)), options(20, List.of(), List.of())));
    assertEquals("No se puede construir un puzle válido con estas generaciones y tamaño. Amplía las generaciones o "
        + "reduce el tablero.", error.getMessage());
    var config = PokemonConnectionsConfig.builder().generations(List.of(1)).groupSize(4).pokemonCount(16)
        .mistakesAllowed(4).roundSeconds(120).rounds(1).build();
    var gold = GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1))
        .players(List.of(new GamePlayer("p1", "Ana"))).now(1000).build();
    var started = engine.start(engine.createInitialState(config, gold), gold);
    error = assertThrows(EngineException.class, () -> engine.getResults(started));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
    assertSame(PokemonConnectionsPlayerState.Spectator.INSTANCE, engine.getPlayerState(started, "p9", gold));
    // Sin progreso para un jugador de la lista (inalcanzable: createProgress los incluye a todos): espectador.
    var withoutProgress = started.toBuilder().progress(Map.of()).build();
    assertSame(PokemonConnectionsPlayerState.Spectator.INSTANCE, engine.getPlayerState(withoutProgress, "p1", gold));
    var player = assertInstanceOf(PokemonConnectionsPlayerState.Player.class,
        engine.getPlayerState(started, "p1", gold));
    assertTrue(player.canSubmit());
    assertFalse(player.foundGroups().iterator().hasNext());
  }

  @Test
  void prefersTheCompleteCuratedTemplate() {
    DoubleSupplier random = () -> 0.1;
    var puzzle = PokemonConnectionsCatalog.generateConnectionsPuzzle(context(random),
        options(16, List.of(), List.of()));
    assertEquals("CURATED classic-connections-eevee-family-fossils-dogs-food | "
        + "group-1:vaporeon,jolteon,flareon,espeon group-2:omanyte,kabuto,aerodactyl,lileep "
        + "group-3:growlithe,houndour,electrike,lillipup group-4:vanillite,slurpuff,appletun,alcremie",
        describe(puzzle));
    assertEquals("Evoluciones de Eevee", puzzle.groups().getFirst().label());
  }

  @Test
  void rotatesTheTemplateOnTwelvePokemonBoards() {
    var random = new Mulberry32(7);
    var puzzle = PokemonConnectionsCatalog.generateConnectionsPuzzle(context(random),
        options(12, List.of(), List.of()));
    assertEquals("CURATED classic-connections-eevee-family-fossils-dogs | "
        + "group-1:vaporeon,jolteon,flareon,espeon group-2:omanyte,kabuto,aerodactyl,lileep "
        + "group-3:growlithe,houndour,electrike,lillipup", describe(puzzle));
    assertEquals(0.97690763277933, random.getAsDouble());
  }

  @Test
  void skipsRotationsWithExcludedCategories() {
    var random = new Mulberry32(8);
    var puzzle = PokemonConnectionsCatalog.generateConnectionsPuzzle(context(random),
        options(12, List.of(), List.of("eevee-family")));
    assertEquals("CURATED classic-connections-fossils-dogs-food | "
        + "group-1:omanyte,kabuto,aerodactyl,lileep group-2:growlithe,houndour,electrike,lillipup "
        + "group-3:vanillite,slurpuff,appletun,alcremie", describe(puzzle));
    assertEquals(0.3006645820569247, random.getAsDouble());
  }

  @Test
  void aUsedCuratedKeyFallsBackToADynamicPuzzle() {
    var random = new Mulberry32(9);
    var puzzle = PokemonConnectionsCatalog.generateConnectionsPuzzle(context(random),
        options(16, List.of("classic-connections-eevee-family-fossils-dogs-food"), List.of()));
    assertEquals("DYNAMIC dynamic-food:alcremie,appletun,slurpuff,vanillite|single-stage:espeon,houndour,jolteon,"
        + "kabuto|single-type:aerodactyl,flareon,lileep,lillipup|type-water:electrike,growlithe,omanyte,vaporeon | "
        + "group-1:omanyte,growlithe,vaporeon,electrike group-2:vanillite,slurpuff,appletun,alcremie "
        + "group-3:jolteon,espeon,kabuto,houndour group-4:flareon,aerodactyl,lillipup,lileep", describe(puzzle));
    assertEquals(0.0026529785245656967, random.getAsDouble());
  }

  @Test
  void withoutCuratedPreferenceTheDynamicPuzzleWins() {
    DoubleSupplier random = () -> 0.9;
    var puzzle = PokemonConnectionsCatalog.generateConnectionsPuzzle(context(random),
        options(16, List.of(), List.of()));
    assertEquals("DYNAMIC dynamic-dogs:electrike,growlithe,houndour,lillipup|eevee-family:espeon,flareon,jolteon,"
        + "vaporeon|food:alcremie,appletun,slurpuff,vanillite|fossils:aerodactyl,kabuto,lileep,omanyte | "
        + "group-1:vaporeon,jolteon,flareon,espeon group-2:kabuto,aerodactyl,lileep,omanyte "
        + "group-3:electrike,lillipup,growlithe,houndour group-4:alcremie,vanillite,slurpuff,appletun",
        describe(puzzle));
  }
}

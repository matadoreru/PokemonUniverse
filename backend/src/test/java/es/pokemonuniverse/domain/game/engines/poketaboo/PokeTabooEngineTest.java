package es.pokemonuniverse.domain.game.engines.poketaboo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooAction;
import es.pokemonuniverse.domain.game.engines.poketaboo.PokeTabooTypes.PokeTabooState;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.GoldenManifests;
import es.pokemonuniverse.golden.GoldenReplayer;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Lo que las fixtures doradas no cubren: manifiesto, parseo, normalización de texto y ramas inalcanzables. */
class PokeTabooEngineTest {

  private final PokeTabooEngine engine = new PokeTabooEngine(GoldenManifests.of(PokeTabooEngine.ID));

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static GameContext context(int players) {
    var list = new ArrayList<GamePlayer>();
    for (int index = 1; index <= players; index++) list.add(new GamePlayer("p" + index, "Player " + index));
    return GameContext.builder(GoldenCatalogs.load("gen1-2"), new Mulberry32(1)).players(list).now(1000).build();
  }

  private PokeTabooState started(GameContext context) {
    var config = new PokeTabooConfig(List.of(1), 30, 1, true, true);
    return engine.start(engine.createInitialState(config, context), context);
  }

  @Test
  void defaultConfigMatchesTheRegistryManifest() {
    assertEquals("poke-taboo", engine.manifest().id());
    assertTrue(JsonTree.equal(GoldenReplayer.tree(engine.manifest().defaultConfig()),
        GoldenReplayer.tree(engine.defaultConfig())));
  }

  @Test
  void rejectsAManifestOfAnotherGame() {
    var other = GoldenManifests.of("higher-lower");
    assertThrows(IllegalArgumentException.class, () -> new PokeTabooEngine(other));
  }

  @Test
  void parsesTheStrictActionsWithTheJsTrim() throws IOException {
    var longest = "x".repeat(180);
    var hint = engine.parseAction(json("{\"type\":\"SEND_HINT\",\"text\":\"\\u00a0\\ufeff " + longest + "\\u2028\"}"));
    assertEquals(longest, assertInstanceOf(PokeTabooAction.SendHint.class, hint).text());
    var id = "y".repeat(96);
    var guess = engine.parseAction(json("{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + id + "\"}"));
    assertEquals(id, assertInstanceOf(PokeTabooAction.GuessPokemon.class, guess).pokemonId());
    for (var invalid : List.of("{\"type\":\"SEND_HINT\",\"text\":\" \\u00a0\\t \"}",
        "{\"type\":\"SEND_HINT\",\"text\":\"" + longest + "x\"}", "{\"type\":\"SEND_HINT\",\"text\":\"a\",\"x\":1}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"\"}", "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":\"" + id + "y\"}",
        "{\"type\":\"GUESS_POKEMON\",\"pokemonId\":7}", "{\"type\":\"OTHER\"}", "{}", "[]", "null")) {
      assertThrows(ConfigValidationException.class, () -> engine.parseAction(json(invalid)), invalid);
    }
  }

  /** Valores de referencia obtenidos con {@code normalizeTabooText} de Node (ICU de V8). */
  @Test
  void normalizesTextLikeTheTypeScriptRules() {
    assertEquals("es un slowbro raro", PokeTabooRules.normalizeTabooText("  Es un SLÓWBRO   raro "));
    // ¨ ^ ` y ʰ son Diacritic (no marcas combinantes): desaparecen en lugar de convertirse en separadores.
    assertEquals("abcd", PokeTabooRules.normalizeTabooText("a¨b^c`d"));
    assertEquals("a", PokeTabooRules.normalizeTabooText("ʰa"));
    assertEquals("ｐｉｋａｃｈｕ", PokeTabooRules.normalizeTabooText("Ｐｉｋａｃｈｕ"));
    assertEquals("nandu ca", PokeTabooRules.normalizeTabooText("Ñandú\u00a0ÇA"));
    assertEquals("farfetch d", PokeTabooRules.normalizeTabooText("Farfetch’d"));
    assertEquals("nidoran", PokeTabooRules.normalizeTabooText("Nidoran♀"));
    assertEquals("ǆemal istanbul", PokeTabooRules.normalizeTabooText("ǅemal İstanbul"));
    assertEquals("xy", PokeTabooRules.normalizeTabooText("x\u0301\u0308y"));
  }

  @Test
  void aliasesStripRegionalFormsAndTaurosBreeds() {
    var catalog = GoldenCatalogs.load("gen1-2");
    // Referencia de Node: los nombres localizados ("Tauros") coinciden con el id sin raza y se deduplican.
    assertEquals(List.of("tauros de paldea combat breed", "tauros paldea combat breed", "tauros"),
        PokeTabooRules.tabooPokemonAliases(catalog.byId("tauros-paldea-combat-breed").orElseThrow()));
    var raichu = catalog.byId("raichu-alola").orElseThrow();
    assertTrue(PokeTabooRules.tabooPokemonAliases(raichu).contains("raichu"));
    assertTrue(PokeTabooRules.containsTabooPokemonName("Un RÁICHU con surf", raichu));
    assertTrue(PokeTabooRules.containsTabooPokemonName("rai-chu", raichu));
    assertFalse(PokeTabooRules.containsTabooPokemonName("Ratón eléctrico de Alola", raichu));
  }

  @Test
  void needsTheManifestPlayersAndAPool() {
    var error = assertThrows(EngineException.class, () -> engine.createInitialState(engine.defaultConfig(), context(1)));
    assertEquals("Se necesitan al menos " + engine.manifest().minPlayers() + " jugadores.", error.getMessage());
    var emptyPool = new PokeTabooConfig(List.of(9), 30, 1, true, true);
    error = assertThrows(EngineException.class, () -> engine.createInitialState(emptyPool, context(2)));
    assertEquals("No hay Pokémon disponibles para esa configuración.", error.getMessage());
  }

  @Test
  void startsOnlyOnceAndPreloadsTheTarget() {
    var preloaded = new ArrayList<String>();
    var context = context(2).toBuilder().preloadImage(preloaded::add).build();
    var state = started(context);
    assertEquals(1, preloaded.size());
    var error = assertThrows(EngineException.class, () -> engine.start(state, context));
    assertEquals("La partida ya ha comenzado.", error.getMessage());
    error = assertThrows(EngineException.class, () -> engine.getResults(state));
    assertEquals("Results are unavailable before the game finishes", error.getMessage());
  }

  /** Estados que el flujo público no produce: el secreto o el pool desaparecen del catálogo. */
  @Test
  void returnsTheServerLiteralsForUnreachableStates() {
    var context = context(2);
    var state = started(context);
    var descriptor = state.descriptorId();
    var lost = state.toBuilder().targetPokemonId("missingno").build();
    var result = engine.handleAction(lost, descriptor, new PokeTabooAction.SendHint("Pista"), context.withNow(2000));
    assertEquals("El Pokémon secreto no está disponible.", result.error());
    var error = assertThrows(EngineException.class,
        () -> engine.handleTimeout(lost, context.withNow(state.roundEndsAt())));
    assertEquals("El secreto de PokéTaboo ya no está disponible.", error.getMessage());
    var noPool = state.toBuilder().phase(GamePhase.ROUND_RESULTS).poolIds(List.of("missingno"))
        .nextTransitionAt(5000L).build();
    error = assertThrows(EngineException.class, () -> engine.handleTimeout(noPool, context.withNow(5000)));
    assertEquals("No hay Pokémon disponibles para PokéTaboo.", error.getMessage());
  }

  /** Con todo el pool usado, el secreto se vuelve a elegir entre todo el pool. */
  @Test
  void reusesThePoolWhenEveryPokemonWasUsed() {
    var context = context(2);
    var state = started(context);
    var exhausted = state.toBuilder().phase(GamePhase.ROUND_RESULTS).poolIds(List.of("pikachu"))
        .usedPokemonIds(List.of("pikachu")).nextTransitionAt(5000L).attemptCounts(Map.of()).build();
    var next = engine.handleTimeout(exhausted, context.withNow(5000));
    assertEquals("pikachu", next.targetPokemonId());
    assertEquals(List.of("pikachu"), next.usedPokemonIds());
  }
}

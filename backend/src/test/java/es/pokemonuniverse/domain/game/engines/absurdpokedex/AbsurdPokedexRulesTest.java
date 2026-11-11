package es.pokemonuniverse.domain.game.engines.absurdpokedex;

import static es.pokemonuniverse.support.EngineTestKit.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engines.absurdpokedex.AbsurdPokedexTypes.AbsurdPokedexEntry;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.PokedexEntry;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.golden.GoldenCatalogs;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AbsurdPokedexRulesTest {

  private static final InMemoryPokemonCatalog GOLDEN = GoldenCatalogs.load("gen1-2");
  private static final Pokemon PIKACHU = GOLDEN.byId("pikachu").orElseThrow();

  private static AbsurdPokedexConfig config(String mode, int rounds, List<Integer> generations) {
    return AbsurdPokedexConfig.builder().generations(generations).rounds(rounds).writeSeconds(60).voteSeconds(30)
        .mode(AbsurdPokedexMode.valueOf(mode)).build();
  }

  private static void assertInvalid(String text) {
    assertThrows(ConfigValidationException.class, () -> AbsurdPokedexConfig.parse(json(text)), text);
  }

  @Test
  void parsesTheStrictConfigWithItsLimits() throws IOException {
    var parsed = AbsurdPokedexConfig.parse(json(
        "{\"generations\":[2,1],\"rounds\":10.0,\"writeSeconds\":120,\"voteSeconds\":15}"));
    assertEquals(List.of(1, 2), parsed.generations());
    assertEquals(10, parsed.rounds());
    assertEquals(120, parsed.writeSeconds());
    assertEquals(15, parsed.voteSeconds());
    assertEquals(AbsurdPokedexMode.CLASSIC, parsed.mode());
    assertEquals(AbsurdPokedexMode.REAL_ENTRY, AbsurdPokedexConfig.parse(json(
        "{\"generations\":[1],\"rounds\":1,\"writeSeconds\":30,\"voteSeconds\":60,\"mode\":\"REAL_ENTRY\"}")).mode());
    assertEquals(new AbsurdPokedexConfig(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9), 5, 60, 30, AbsurdPokedexMode.CLASSIC),
        AbsurdPokedexConfig.defaults());
    var base = "\"generations\":[1],";
    assertInvalid("{" + base + "\"rounds\":10.5,\"writeSeconds\":60,\"voteSeconds\":30}");
    assertInvalid("{" + base + "\"rounds\":0,\"writeSeconds\":60,\"voteSeconds\":30}");
    assertInvalid("{" + base + "\"rounds\":11,\"writeSeconds\":60,\"voteSeconds\":30}");
    assertInvalid("{" + base + "\"rounds\":5,\"writeSeconds\":29,\"voteSeconds\":30}");
    assertInvalid("{" + base + "\"rounds\":5,\"writeSeconds\":121,\"voteSeconds\":30}");
    assertInvalid("{" + base + "\"rounds\":5,\"writeSeconds\":60,\"voteSeconds\":14}");
    assertInvalid("{" + base + "\"rounds\":5,\"writeSeconds\":60,\"voteSeconds\":61}");
    assertInvalid("{" + base + "\"rounds\":5,\"writeSeconds\":60,\"voteSeconds\":30,\"mode\":\"TURBO\"}");
    assertInvalid("{" + base + "\"rounds\":5,\"writeSeconds\":60,\"voteSeconds\":30,\"extra\":1}");
  }

  @Test
  void parsesTheStrictActions() throws IOException {
    var vote = AbsurdPokedexTypes.AbsurdPokedexAction.parse(
        json("{\"type\":\"VOTE_ABSURD\",\"entryId\":\"a\",\"funnyEntryId\":\"b\"}"));
    assertEquals(new AbsurdPokedexTypes.AbsurdPokedexAction.Vote("a", "b"), vote);
    assertEquals(new AbsurdPokedexTypes.AbsurdPokedexAction.Vote("a", null),
        AbsurdPokedexTypes.AbsurdPokedexAction.parse(json("{\"type\":\"VOTE_ABSURD\",\"entryId\":\"a\"}")));
    assertEquals(new AbsurdPokedexTypes.AbsurdPokedexAction.SubmitEntry("hola"),
        AbsurdPokedexTypes.AbsurdPokedexAction.parse(json("{\"type\":\"SUBMIT_ABSURD_ENTRY\",\"text\":\"  hola \"}")));
    var tooLong = "x".repeat(151);
    for (var invalid : List.of("{\"type\":\"VOTE_ABSURD\",\"entryId\":\"a\",\"funnyEntryId\":null}",
        "{\"type\":\"VOTE_ABSURD\",\"entryId\":\"\"}", "{\"type\":\"VOTE_ABSURD\",\"entryId\":\"a\",\"x\":1}",
        "{\"type\":\"SUBMIT_ABSURD_ENTRY\",\"text\":\"   \"}",
        "{\"type\":\"SUBMIT_ABSURD_ENTRY\",\"text\":\"" + tooLong + "\"}",
        "{\"type\":\"UPDATE_ABSURD_DRAFT\",\"text\":\"" + tooLong + "\"}", "{\"type\":\"OTRA\"}", "[]")) {
      assertThrows(ConfigValidationException.class, () -> AbsurdPokedexTypes.AbsurdPokedexAction.parse(json(invalid)),
          invalid);
    }
    assertEquals(new AbsurdPokedexTypes.AbsurdPokedexAction.UpdateDraft(""),
        AbsurdPokedexTypes.AbsurdPokedexAction.parse(json("{\"type\":\"UPDATE_ABSURD_DRAFT\",\"text\":\"\"}")));
  }

  private static List<AbsurdPokedexEntry> entries() {
    return List.of(new AbsurdPokedexEntry("e1", "uno", "p1", false), new AbsurdPokedexEntry("e2", "dos", "p2", false),
        new AbsurdPokedexEntry("e3", "tres", "p3", false));
  }

  private static Map<String, String> votes(String... pairs) {
    var map = new LinkedHashMap<String, String>();
    for (int index = 0; index < pairs.length; index += 2) map.put(pairs[index], pairs[index + 1]);
    return map;
  }

  @Test
  void classicScoresOnePerVotePlusTwoForTheTop() {
    var result = AbsurdPokedexRules.score(AbsurdPokedexMode.CLASSIC, PIKACHU, entries(),
        votes("p2", "e1", "p3", "e1", "p4", "e2"), Map.of(), null, List.of());
    assertEquals(Map.of("p1", 4, "p2", 1), result.pointsAwarded());
    assertEquals(List.of("p1"), result.winnerPlayerIds());
    assertEquals(List.of("e1", "e2", "e3"), result.entries().stream().map(entry -> entry.id()).toList());
    assertEquals(List.of("p2", "p3"), result.entries().getFirst().votedBy());
    assertEquals(null, result.realEntry());
    assertFalse(result.skipped());
  }

  @Test
  void classicTieGivesTheBonusToEveryTopEntry() {
    var tied = AbsurdPokedexRules.score(AbsurdPokedexMode.CLASSIC, PIKACHU, entries(),
        votes("p3", "e1", "p1", "e2"), Map.of(), null, List.of());
    assertEquals(Map.of("p1", 3, "p2", 3), tied.pointsAwarded());
    assertEquals(List.of("p1", "p2"), tied.winnerPlayerIds());
    var none = AbsurdPokedexRules.score(AbsurdPokedexMode.CLASSIC, PIKACHU, entries(), Map.of(), Map.of(), null,
        List.of("p9"));
    assertTrue(none.pointsAwarded().isEmpty());
    assertTrue(none.winnerPlayerIds().isEmpty());
    assertEquals(List.of("p9"), none.missingPlayerIds());
  }

  @Test
  void realEntryScoresGuessFoolAndFunny() {
    var all = List.of(new AbsurdPokedexEntry("r", "oficial", null, true), new AbsurdPokedexEntry("e2", "dos", "p2", false),
        new AbsurdPokedexEntry("e3", "tres", "p3", false));
    var result = AbsurdPokedexRules.score(AbsurdPokedexMode.REAL_ENTRY, PIKACHU, all,
        votes("p1", "r", "p2", "e3"), votes("p1", "e3"), "Rojo", List.of());
    assertEquals(Map.of("p3", 2, "p1", 2), result.pointsAwarded());
    assertEquals(List.of("p1", "p3"), result.winnerPlayerIds());
    assertEquals("r", result.realEntry().id());
    assertEquals("Rojo", result.realEntry().versionLabel());
    var official = result.entries().stream().filter(entry -> entry.isReal()).findFirst().orElseThrow();
    assertEquals(null, official.authorId());
    assertEquals(List.of("p1"), official.votedBy());
  }

  @Test
  void realEntryPoolNeedsAnEntryOfAtMost150Chars() {
    var config = config("REAL_ENTRY", 5, List.of(1, 2));
    var pool = AbsurdPokedexRules.pool(config, GOLDEN);
    assertFalse(pool.isEmpty());
    for (var pokemon : pool) {
      var usable = AbsurdPokedexRules.usableRealEntries(pokemon, GOLDEN);
      assertFalse(usable.isEmpty(), pokemon.id());
      for (var entry : usable) assertTrue(entry.text().length() <= 150, pokemon.id());
    }
    var all = GOLDEN.forGenerations(List.of(1, 2), false);
    assertTrue(pool.size() <= all.size());
    assertEquals(all.size(), AbsurdPokedexRules.pool(config("CLASSIC", 5, List.of(1, 2)), GOLDEN).size());
  }

  @Test
  void availabilityNeedsAsManyPokemonAsRounds() {
    var pool = AbsurdPokedexRules.pool(config("CLASSIC", 5, List.of(1)), GOLDEN);
    assertTrue(AbsurdPokedexRules.availabilityIssue(config("CLASSIC", pool.size(), List.of(1)), pool).isEmpty());
    int n = pool.size();
    var small = pool.subList(0, 3);
    assertEquals("Solo hay 3 Pokémon disponibles en estas generaciones: baja las rondas a 3 o añade generaciones.",
        AbsurdPokedexRules.availabilityIssue(config("CLASSIC", 5, List.of(1)), small).orElseThrow());
    assertTrue(n > 3);
    assertEquals("No hay Pokémon con entradas de Pokédex en las generaciones seleccionadas.",
        AbsurdPokedexRules.availabilityIssue(config("REAL_ENTRY", 1, List.of(9)), List.of()).orElseThrow());
  }

  @Test
  void availabilityFromTheCatalogMatchesTheFullPool() {
    for (var mode : List.of("CLASSIC", "REAL_ENTRY")) {
      for (var generations : List.of(List.of(1), List.of(1, 2), List.of(9))) {
        var pool = AbsurdPokedexRules.pool(config(mode, 1, generations), GOLDEN);
        for (int rounds : new int[] {1, 5, 10, pool.size(), pool.size() + 1}) {
          if (rounds < 1) continue;
          var config = config(mode, rounds, generations);
          assertEquals(AbsurdPokedexRules.availabilityIssue(config, pool),
              AbsurdPokedexRules.availabilityIssue(config, GOLDEN), mode + " " + generations + " " + rounds);
        }
      }
    }
  }

  @Test
  void onlySpanishEntriesAreUsable() {
    var english = new PokedexEntry("pikachu", "It keeps its tail raised.", "en", 1, "red", "Rojo");
    var spanish = new PokedexEntry("pikachu", "Guarda electricidad en las mejillas.", "es", 1, "red", "Rojo");
    var onlyEnglish = new InMemoryPokemonCatalog(List.of(PIKACHU), List.of(), List.of(), Map.of(), List.of(english));
    assertTrue(AbsurdPokedexRules.usableRealEntries(PIKACHU, onlyEnglish).isEmpty());
    assertTrue(AbsurdPokedexRules.pool(config("REAL_ENTRY", 1, List.of(1)), onlyEnglish).isEmpty());
    assertEquals("No hay Pokémon con entradas de Pokédex en las generaciones seleccionadas.",
        AbsurdPokedexRules.availabilityIssue(config("REAL_ENTRY", 1, List.of(1)), onlyEnglish).orElseThrow());
    var both = new InMemoryPokemonCatalog(List.of(PIKACHU), List.of(), List.of(), Map.of(), List.of(english, spanish));
    assertEquals(List.of(spanish), AbsurdPokedexRules.usableRealEntries(PIKACHU, both));
  }

  @Test
  void resultsBreakTiesByRoundWinsThenId() {
    var base = AbsurdPokedexTypes.AbsurdPokedexState.builder().phase(es.pokemonuniverse.domain.game.engine.GamePhase.ROUND_RESULTS)
        .config(AbsurdPokedexConfig.defaults()).playerIds(List.of("c", "b", "a"))
        .scores(Map.of("a", 3, "b", 3, "c", 3))
        .playerStats(Map.of("c", AbsurdPokedexTypes.AbsurdPokedexPlayerStats.ZERO.toBuilder().roundWins(2).build()));
    assertThrows(es.pokemonuniverse.domain.game.engine.EngineException.class,
        () -> AbsurdPokedexRules.buildResults(base.build()));
    var results = AbsurdPokedexRules.buildResults(
        base.phase(es.pokemonuniverse.domain.game.engine.GamePhase.GAME_RESULTS).build());
    assertEquals(List.of("c", "a", "b"), results.standings().stream().map(standing -> standing.playerId()).toList());
    assertEquals("c", results.winnerId());
  }
}

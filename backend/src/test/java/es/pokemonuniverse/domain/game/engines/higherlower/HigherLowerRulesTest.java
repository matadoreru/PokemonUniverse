package es.pokemonuniverse.domain.game.engines.higherlower;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerConfig.HigherLowerCategory;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerConfig.HigherLowerDifficulty;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerTypes.HigherLowerChoice;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.golden.GoldenCatalogs;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/** Casos puros de {@code higher-lower/server.test.ts} más una comprobación cruzada con el TS sobre {@code gen1-2}. */
class HigherLowerRulesTest {

  private static Pokemon pokemon(String id, int dex, int attack) {
    return new Pokemon(id, dex, id, 1, true, "/" + id + ".png", "/" + id + "-shiny.png", 50, attack, 80, 70, 60, 90,
        450, 10, 100, 1, 1, "NONE", "red", List.of(), Map.of(), List.of("fire"));
  }

  private static final Pokemon ALPHA = new Pokemon("alpha", 1, "Alpha", 1, true, "/a.png", "/a-s.png", 51, 102, 83, 74,
      65, 96, 457, 7, 69, 1, 3, "NONE", "green", List.of(), Map.of(), List.of("grass"));

  @Test
  void readsEachCategoryField() {
    var expected = Map.of(
        HigherLowerCategory.DEX_NUMBER, 1, HigherLowerCategory.HP, 51, HigherLowerCategory.ATTACK, 102,
        HigherLowerCategory.DEFENSE, 83, HigherLowerCategory.SPECIAL_ATTACK, 74, HigherLowerCategory.SPECIAL_DEFENSE, 65,
        HigherLowerCategory.SPEED, 96, HigherLowerCategory.BASE_STAT_TOTAL, 457);
    for (var category : HigherLowerCategory.values()) {
      assertEquals(expected.get(category), HigherLowerRules.pokemonCategoryValue(ALPHA, category), category.name());
    }
  }

  @Test
  void comparesCurrentAgainstPrevious() {
    assertEquals(HigherLowerChoice.HIGHER, HigherLowerRules.higherLowerAnswer(10, 11));
    assertEquals(HigherLowerChoice.LOWER, HigherLowerRules.higherLowerAnswer(10, 9));
    assertEquals(HigherLowerChoice.SAME, HigherLowerRules.higherLowerAnswer(10, 10));
  }

  @Test
  void grantsCentralizedStreakBonuses() {
    assertEquals(0, HigherLowerRules.streakBonus(0));
    assertEquals(0, HigherLowerRules.streakBonus(2));
    assertEquals(1, HigherLowerRules.streakBonus(3));
    assertEquals(1, HigherLowerRules.streakBonus(4));
    assertEquals(2, HigherLowerRules.streakBonus(5));
    assertEquals(2, HigherLowerRules.streakBonus(9));
    assertEquals(4, HigherLowerRules.streakBonus(10));
    assertEquals(4, HigherLowerRules.streakBonus(25));
  }

  /** {@code makes comparisons progressively closer as difficulty increases}. */
  @Test
  void makesComparisonsProgressivelyCloserAsDifficultyIncreases() {
    var previous = pokemon("alpha", 1, 100);
    int[] attacks = {100, 105, 110, 120, 140};
    var candidates = new java.util.ArrayList<Pokemon>();
    for (int index = 0; index < attacks.length; index++) {
      candidates.add(pokemon("difficulty-" + index, index + 10, attacks[index]));
    }
    var differences = new java.util.ArrayList<Integer>();
    for (var difficulty : HigherLowerDifficulty.values()) {
      var selected = HigherLowerRules.selectPokemonByDifficulty(previous, candidates, HigherLowerCategory.ATTACK,
          difficulty, () -> 0);
      differences.add(Math.abs(selected.attack() - previous.attack()));
    }
    assertEquals(List.of(40, 20, 10, 5, 0), differences);
  }

  /** {@code keeps random selection among equally suitable candidates}. */
  @Test
  void keepsRandomSelectionAmongEquallySuitableCandidates() {
    var previous = pokemon("alpha", 1, 100);
    var candidates = List.of(pokemon("tie-a", 10, 100), pokemon("tie-b", 11, 100), pokemon("far", 12, 150));
    assertEquals("tie-a", HigherLowerRules.selectPokemonByDifficulty(previous, candidates, HigherLowerCategory.ATTACK,
        HigherLowerDifficulty.VERY_HARD, () -> 0).id());
    assertEquals("tie-b", HigherLowerRules.selectPokemonByDifficulty(previous, candidates, HigherLowerCategory.ATTACK,
        HigherLowerDifficulty.VERY_HARD, () -> 0.99).id());
  }

  @Test
  void rejectsAnEmptyCandidateList() {
    var error = assertThrows(EngineException.class, () -> HigherLowerRules.selectPokemonByDifficulty(ALPHA, List.of(),
        HigherLowerCategory.HP, HigherLowerDifficulty.NORMAL, () -> 0));
    assertEquals("No hay Pokémon candidatos para esta ronda.", error.getMessage());
  }

  /**
   * Valores fijados con {@code selectPokemonByDifficulty} de TS ({@code npx tsx} sobre {@code dist} y
   * {@code golden/catalog.ts}): Pikachu frente a gen 1–2 sin Pikachu, {@code mulberry32(1)} nuevo por dificultad. El
   * siguiente {@code random()} fue {@code 0.002735721180215478}: la selección consume exactamente una extracción.
   */
  @Test
  void matchesTypeScriptOnTheGoldenCatalogWithMulberry32() {
    var catalog = GoldenCatalogs.load("gen1-2");
    var previous = catalog.byId("pikachu").orElseThrow();
    var candidates = catalog.forGenerations(List.of(1, 2)).stream().filter(p -> !p.id().equals("pikachu")).toList();
    var expected = Map.of(
        HigherLowerCategory.ATTACK, List.of("arcanine", "cloyster", "furret", "espeon", "magcargo"),
        HigherLowerCategory.BASE_STAT_TOTAL, List.of("charizard", "alakazam", "metapod", "diglett", "machop"));
    for (var category : List.of(HigherLowerCategory.ATTACK, HigherLowerCategory.BASE_STAT_TOTAL)) {
      var difficulties = HigherLowerDifficulty.values();
      for (int index = 0; index < difficulties.length; index++) {
        var random = new Mulberry32(1);
        var draws = new AtomicInteger();
        var picked = HigherLowerRules.selectPokemonByDifficulty(previous, candidates, category, difficulties[index], () -> {
          draws.incrementAndGet();
          return random.getAsDouble();
        });
        assertEquals(expected.get(category).get(index), picked.id(), category + " " + difficulties[index]);
        assertEquals(1, draws.get());
        assertEquals(0.002735721180215478, random.getAsDouble());
      }
    }
  }
}

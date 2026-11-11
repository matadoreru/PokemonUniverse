package es.pokemonuniverse.domain.pokemon.conditions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.golden.GoldenCatalogs;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.DoubleSupplier;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * {@link ConditionGenerator} directamente, con el pool de la fixture {@code gen1-2} y las familias que pasa Pokémon
 * Bluff Auction (hasta dos condiciones y 80 combinaciones). Bingo lo prueba a través de sus doradas.
 */
class ConditionGeneratorTest {

  private static final List<Integer> GENERATIONS = List.of(1, 2);
  private static final List<Pokemon> POOL = GoldenCatalogs.load("gen1-2").forGenerations(GENERATIONS);

  /** Cuenta las extracciones de la fuente de azar que envuelve. */
  private static final class CountingRandom implements DoubleSupplier {
    private final DoubleSupplier source;
    int draws;

    CountingRandom(long seed) {
      this.source = new Mulberry32(seed);
    }

    @Override
    public double getAsDouble() {
      draws++;
      return source.getAsDouble();
    }
  }

  /**
   * Las familias de {@code PokemonBluffAuctionConditions.families} para este pool: las de tipo, generación, Pokédex y
   * estadísticas siempre; altura, peso, evolución, legendarios y habilidades si el pool trae esos datos; nunca color.
   */
  private static Map<String, Boolean> bluffFamilies() {
    var families = new LinkedHashMap<String, Boolean>();
    for (var key : List.of("generation", "dexNumber", "type", "typeCombination", "typeCount", "hp", "attack",
        "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal")) {
      families.put(key, true);
    }
    families.put("height", POOL.stream().allMatch(pokemon -> pokemon.heightDecimeters() > 0));
    families.put("weight", POOL.stream().allMatch(pokemon -> pokemon.weightHectograms() > 0));
    families.put("evolutionStage", POOL.stream().allMatch(pokemon -> pokemon.evolutionStage() != null
        && pokemon.evolutionStage() != 0 && pokemon.evolutionStageCount() != null
        && pokemon.evolutionStageCount() != 0));
    families.put("legendaryStatus", POOL.stream().anyMatch(pokemon -> "LEGENDARY".equals(pokemon.legendaryStatus())
        || "MYTHICAL".equals(pokemon.legendaryStatus())));
    families.put("color", false);
    families.put("abilities", POOL.stream().anyMatch(pokemon -> pokemon.abilities() != null
        && !pokemon.abilities().isEmpty()));
    return families;
  }

  private static ConditionGenerationOptions options(int maxConditions, int combinationLimit) {
    return new ConditionGenerationOptions(GENERATIONS, bluffFamilies(), maxConditions, combinationLimit);
  }

  private static Set<String> families(ConditionTemplate template) {
    return template.conditions().stream().map(ConditionRules::bingoConditionFamily).collect(Collectors.toSet());
  }

  private static List<ConditionTemplate> singles(List<ConditionTemplate> templates) {
    return templates.stream().filter(template -> template.conditions().size() == 1).toList();
  }

  private static List<ConditionTemplate> pairs(List<ConditionTemplate> templates) {
    return templates.stream().filter(template -> template.conditions().size() == 2).toList();
  }

  @Test
  void bluffAuctionFamiliesAllProduceTemplatesButColor() {
    var templates = ConditionGenerator.buildConditionTemplates(POOL, options(2, 80), new Mulberry32(7));
    var produced = new LinkedHashSet<String>();
    for (var template : singles(templates)) produced.addAll(families(template));
    var enabled = new LinkedHashSet<String>();
    bluffFamilies().forEach((family, on) -> {
      if (on) enabled.add(family);
    });
    // gen1-2 trae todos los datos: solo falta color, que Bluff Auction no usa.
    assertEquals(17, enabled.size());
    assertEquals(enabled, produced);
  }

  /** Cada plantilla tiene al menos dos candidatos, todos los que cumplen sus condiciones, y una clave única. */
  @Test
  void everyTemplateListsAllItsCandidates() {
    var templates = ConditionGenerator.buildConditionTemplates(POOL, options(2, 80), new Mulberry32(7));
    var keys = new HashSet<String>();
    for (var template : templates) {
      assertTrue(keys.add(template.key()), template.key());
      assertEquals(ConditionRules.bingoCellKey(template.conditions()), template.key());
      var matching = POOL.stream()
          .filter(pokemon -> ConditionRules.pokemonMatchesBingoCell(pokemon, template.conditions()))
          .map(Pokemon::id).toList();
      assertEquals(matching, template.candidatePokemonIds(), template.key());
      assertTrue(matching.size() >= 2, template.key());
      assertEquals(ConditionGenerator.difficulty(matching.size(), POOL.size()), template.difficulty());
    }
  }

  /** Las combinaciones paran en {@code combinationLimit} y nunca juntan dos condiciones de la misma familia. */
  @Test
  void combinationLimitCapsTheTwoConditionTemplates() {
    for (int limit : new int[] {1, 5, 80}) {
      var pairs = pairs(ConditionGenerator.buildConditionTemplates(POOL, options(2, limit), new Mulberry32(7)));
      assertEquals(limit, pairs.size(), "combinationLimit " + limit);
      for (var pair : pairs) assertEquals(2, families(pair).size(), pair.key());
    }
    assertEquals(List.of(), pairs(ConditionGenerator.buildConditionTemplates(POOL, options(1, 80), new Mulberry32(7))));
  }

  /**
   * Solo la combinación consume {@code random}: una extracción por plantilla simple menos una al barajarlas. Las
   * simples no dependen de la semilla y van primero, en el mismo orden con una o con dos condiciones.
   */
  @Test
  void onlyTheCombinationConsumesRandom() {
    var once = new CountingRandom(7);
    var simple = ConditionGenerator.buildConditionTemplates(POOL, options(1, 80), once);
    assertEquals(0, once.draws);

    var first = new CountingRandom(7);
    var combined = ConditionGenerator.buildConditionTemplates(POOL, options(2, 80), first);
    assertEquals(simple, singles(combined));
    assertEquals(simple, combined.subList(0, simple.size()));
    assertEquals(simple.size() - 1, first.draws);

    var other = ConditionGenerator.buildConditionTemplates(POOL, options(2, 80), new CountingRandom(8));
    assertEquals(simple, singles(other));
    assertNotEquals(pairs(combined), pairs(other), "otra semilla combina otras parejas");
  }

  @Test
  void quantileUsesTheSortedDistinctValues() {
    assertEquals(3, ConditionGenerator.quantile(List.of(5, 1, 3, 3, 9), .5));
    assertEquals(1, ConditionGenerator.quantile(List.of(5, 1, 3, 3, 9), 0));
    assertEquals(9, ConditionGenerator.quantile(List.of(5, 1, 3, 3, 9), 1));
  }

  @Test
  void difficultyFollowsTheShareOfThePool() {
    assertEquals(ConditionDifficulty.EASY, ConditionGenerator.difficulty(25, 100));
    assertEquals(ConditionDifficulty.MEDIUM, ConditionGenerator.difficulty(8, 100));
    assertEquals(ConditionDifficulty.HARD, ConditionGenerator.difficulty(7, 100));
  }
}

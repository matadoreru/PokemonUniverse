package es.pokemonuniverse.domain.game.engines.pokemonbluffauction;

import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionConditionTemplate;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionConditionView;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionCuratedCategory;
import es.pokemonuniverse.domain.game.engines.pokemonbluffauction.PokemonBluffAuctionTypes.BluffAuctionRule;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.conditions.Condition;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionEvolutionStatus;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionGenerationOptions;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionGenerator;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionOperator;
import es.pokemonuniverse.domain.pokemon.conditions.ConditionRules;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.DoubleSupplier;

/**
 * Traducción literal del TS que antes estaba en {@code pokemon-bluff-auction/conditions.ts}: las condiciones de la
 * subasta salen del generador compartido ({@code domain/pokemon/conditions}) más condiciones y categorías curadas. Solo
 * el generador compartido consume {@code random}.
 */
public final class PokemonBluffAuctionConditions {

  /** {@code curatedCategoryDexNumbers}; {@link EnumMap} itera en el orden de las claves TS. */
  private static final Map<BluffAuctionCuratedCategory, Set<Integer>> CURATED_CATEGORY_DEX_NUMBERS =
      new EnumMap<>(Map.of(
          BluffAuctionCuratedCategory.DOG, Set.of(37, 38, 58, 59, 209, 210, 228, 229, 261, 262, 309, 310, 506, 507,
              508, 676, 744, 745, 835, 836, 888, 889, 926, 927, 942, 943, 971, 972),
          BluffAuctionCuratedCategory.CAT, Set.of(52, 53, 300, 301, 431, 432, 509, 510, 667, 668, 677, 678, 725, 726,
              727, 906, 907, 908),
          BluffAuctionCuratedCategory.STARTER, Set.of(1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498,
              501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912),
          BluffAuctionCuratedCategory.FOSSIL, Set.of(138, 139, 140, 141, 142, 345, 346, 347, 348, 408, 409, 410, 411,
              564, 565, 566, 567, 696, 697, 698, 699, 880, 881, 882, 883),
          BluffAuctionCuratedCategory.PSEUDO_LEGENDARY, Set.of(149, 248, 373, 376, 445, 635, 706, 784, 887, 998),
          BluffAuctionCuratedCategory.ULTRA_BEAST, Set.of(793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806)));

  private static final Map<BluffAuctionCuratedCategory, String> CURATED_CATEGORY_LABELS = Map.of(
      BluffAuctionCuratedCategory.DOG, "Inspirado claramente en un perro o cánido",
      BluffAuctionCuratedCategory.CAT, "Inspirado claramente en un gato o felino",
      BluffAuctionCuratedCategory.STARTER, "Pokémon inicial en su primera etapa",
      BluffAuctionCuratedCategory.FOSSIL, "Pokémon fósil",
      BluffAuctionCuratedCategory.PSEUDO_LEGENDARY, "Pseudolegendario completamente evolucionado",
      BluffAuctionCuratedCategory.ULTRA_BEAST, "Ultraente");

  private static final Map<String, String> STAT_LABELS = Map.of(
      "hp", "PS", "attack", "Ataque", "defense", "Defensa", "specialAttack", "Ataque especial",
      "specialDefense", "Defensa especial", "speed", "Velocidad", "baseStatTotal", "BST");

  /** Las estadísticas que {@code combinedPairs} cruza con tipos. */
  private static final List<String> COMBINED_STATS = List.of("attack", "speed", "baseStatTotal");

  private PokemonBluffAuctionConditions() {}

  private static String symbol(ConditionOperator operator) {
    return operator == ConditionOperator.GT ? ">" : "<";
  }

  /** {@code describeCondition}: textos propios para categorías, estadísticas y habilidades. */
  static String describeCondition(BluffAuctionRule rule) {
    return switch (rule) {
      case BluffAuctionRule.CuratedCategory curated -> CURATED_CATEGORY_LABELS.get(curated.category());
      case BluffAuctionRule.Standard standard -> switch (standard.condition()) {
        case Condition.Stat stat -> stat.operator() == ConditionOperator.GT && stat.value() == 99
            ? STAT_LABELS.get(stat.stat()) + " ≥ 100"
            : STAT_LABELS.get(stat.stat()) + " " + symbol(stat.operator()) + " " + stat.value();
        case Condition.Ability ability -> "Tiene la habilidad " + ConditionRules.bingoWords(ability.ability());
        case Condition other -> ConditionRules.describeBingoCondition(other);
      };
    };
  }

  /** {@code describeBluffAuctionConditions}: las cláusulas y su unión con {@code " + "}. */
  public static BluffAuctionConditionView describeBluffAuctionConditions(List<BluffAuctionRule> conditions) {
    var clauses = conditions.stream().map(PokemonBluffAuctionConditions::describeCondition).toList();
    return new BluffAuctionConditionView(String.join(" + ", clauses), clauses);
  }

  /** {@code pokemonMatchesBluffAuctionCondition}: todas las reglas, cada una por separado. */
  public static boolean pokemonMatchesBluffAuctionCondition(Pokemon pokemon, List<BluffAuctionRule> conditions) {
    for (var rule : conditions) {
      boolean matches = switch (rule) {
        case BluffAuctionRule.CuratedCategory curated ->
            CURATED_CATEGORY_DEX_NUMBERS.get(curated.category()).contains(pokemon.nationalDexNumber());
        case BluffAuctionRule.Standard standard ->
            ConditionRules.pokemonMatchesBingoCell(pokemon, List.of(standard.condition()));
      };
      if (!matches) return false;
    }
    return true;
  }

  /** {@code bluffConditionKey}: la categoría curada manda; si no, la clave de casilla compartida. */
  static String bluffConditionKey(List<BluffAuctionRule> conditions) {
    for (var rule : conditions) {
      if (rule instanceof BluffAuctionRule.CuratedCategory curated) return "CURATED:" + curated.category();
    }
    return ConditionRules.bingoCellKey(standardConditions(conditions));
  }

  private static List<Condition> standardConditions(List<BluffAuctionRule> rules) {
    return rules.stream().map(rule -> ((BluffAuctionRule.Standard) rule).condition()).toList();
  }

  private static List<BluffAuctionRule> rules(List<Condition> conditions) {
    return conditions.stream().<BluffAuctionRule>map(BluffAuctionRule.Standard::new).toList();
  }

  /** Una entrada de {@code byKey}; la dificultad del generador compartido no se usa después. */
  private record Candidate(List<BluffAuctionRule> conditions, List<String> candidatePokemonIds) {}

  private static List<String> matching(List<Pokemon> pool, List<Condition> conditions) {
    return pool.stream()
        .filter(pokemon -> ConditionRules.pokemonMatchesBingoCell(pokemon, conditions))
        .map(Pokemon::id)
        .toList();
  }

  /** {@code Boolean(pokemon.evolutionStage && pokemon.evolutionStageCount)}. */
  private static boolean hasEvolutionStage(Pokemon pokemon) {
    return pokemon.evolutionStage() != null && pokemon.evolutionStage() != 0
        && pokemon.evolutionStageCount() != null && pokemon.evolutionStageCount() != 0;
  }

  /** Las familias de {@code buildBluffAuctionConditions}, en el orden del literal TS. */
  private static Map<String, Boolean> families(List<Pokemon> pool) {
    var families = new LinkedHashMap<String, Boolean>();
    for (var key : List.of("generation", "dexNumber", "type", "typeCombination", "typeCount", "hp", "attack",
        "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal")) {
      families.put(key, true);
    }
    families.put("height", pool.stream().allMatch(pokemon -> pokemon.heightDecimeters() > 0));
    families.put("weight", pool.stream().allMatch(pokemon -> pokemon.weightHectograms() > 0));
    families.put("evolutionStage", pool.stream().allMatch(PokemonBluffAuctionConditions::hasEvolutionStage));
    families.put("legendaryStatus", pool.stream().anyMatch(pokemon -> "LEGENDARY".equals(pokemon.legendaryStatus())
        || "MYTHICAL".equals(pokemon.legendaryStatus())));
    families.put("color", false);
    families.put("abilities", pool.stream().anyMatch(pokemon -> pokemon.abilities() != null
        && !pokemon.abilities().isEmpty()));
    return families;
  }

  /** Las condiciones curadas: las doce fijas más peso y altura si todo el pool los tiene. */
  private static List<List<Condition>> curatedConditions(List<Pokemon> pool) {
    var curated = new ArrayList<List<Condition>>(List.of(
        List.of(new Condition.Stat("baseStatTotal", ConditionOperator.GT, 500)),
        List.of(new Condition.Stat("speed", ConditionOperator.GT, 99)),
        List.of(new Condition.Stat("attack", ConditionOperator.LT, 60)),
        List.of(new Condition.Dex(ConditionOperator.LT, 151)),
        List.of(new Condition.TypeCount(1)),
        List.of(new Condition.TypeCount(2)),
        List.of(new Condition.Evolution(ConditionEvolutionStatus.FINAL)),
        List.of(new Condition.Legendary("LEGENDARY")),
        List.of(new Condition.Legendary("MYTHICAL")),
        List.of(new Condition.Type("water"), new Condition.Stat("speed", ConditionOperator.GT, 80)),
        List.of(new Condition.Generation(3), new Condition.Stat("baseStatTotal", ConditionOperator.GT, 500)),
        List.of(new Condition.Type("fire"), new Condition.Stat("attack", ConditionOperator.GT, 99))));
    if (pool.stream().allMatch(pokemon -> pokemon.weightHectograms() > 0)) {
      curated.add(List.of(new Condition.Physical("weightHectograms", ConditionOperator.GT, 2_000)));
    }
    if (pool.stream().allMatch(pokemon -> pokemon.heightDecimeters() > 0)) {
      curated.add(List.of(new Condition.Physical("heightDecimeters", ConditionOperator.LT, 10)));
    }
    return curated;
  }

  /**
   * {@code buildBluffAuctionConditions}: plantillas compartidas (hasta dos condiciones y 80 combinaciones), curadas
   * ({@code byKey.set} sustituye y conserva la posición), categorías con al menos 3 candidatos y pares de tipo o
   * generación con estadística (que no sustituyen). Se quedan las de un número de candidatos interesante.
   */
  public static List<BluffAuctionConditionTemplate> buildBluffAuctionConditions(List<Pokemon> pool,
      List<Integer> generations, DoubleSupplier random) {
    var templates = ConditionGenerator.buildConditionTemplates(pool,
        new ConditionGenerationOptions(generations, families(pool), 2, 80), random);
    var byKey = new LinkedHashMap<String, Candidate>();
    for (var template : templates) {
      byKey.put(template.key(), new Candidate(rules(template.conditions()), template.candidatePokemonIds()));
    }
    for (var conditions : curatedConditions(pool)) {
      var key = ConditionRules.bingoCellKey(conditions);
      var candidatePokemonIds = matching(pool, conditions);
      if (!candidatePokemonIds.isEmpty()) byKey.put(key, new Candidate(rules(conditions), candidatePokemonIds));
    }
    for (var category : BluffAuctionCuratedCategory.values()) {
      List<BluffAuctionRule> conditions = List.of(new BluffAuctionRule.CuratedCategory(category));
      var candidatePokemonIds = pool.stream()
          .filter(pokemon -> pokemonMatchesBluffAuctionCondition(pokemon, conditions))
          .map(Pokemon::id)
          .toList();
      if (candidatePokemonIds.size() >= 3) {
        byKey.put("CURATED:" + category, new Candidate(conditions, candidatePokemonIds));
      }
    }
    var singles = templates.stream().filter(template -> template.conditions().size() == 1)
        .map(template -> template.conditions().getFirst()).toList();
    var typeConditions = singles.stream().filter(condition -> condition instanceof Condition.Type).toList();
    var statConditions = singles.stream()
        .filter(condition -> condition instanceof Condition.Stat stat && COMBINED_STATS.contains(stat.stat()))
        .toList();
    var generationConditions = singles.stream().filter(condition -> condition instanceof Condition.Generation).toList();
    var combinedPairs = new ArrayList<List<Condition>>();
    for (var type : typeConditions) {
      for (var stat : statConditions) combinedPairs.add(List.of(type, stat));
    }
    for (var generation : generationConditions) {
      for (var stat : statConditions) {
        if (((Condition.Stat) stat).stat().equals("baseStatTotal")) combinedPairs.add(List.of(generation, stat));
      }
    }
    for (var conditions : combinedPairs) {
      var key = ConditionRules.bingoCellKey(conditions);
      if (byKey.containsKey(key)) continue;
      var candidatePokemonIds = matching(pool, conditions);
      if (!candidatePokemonIds.isEmpty()) byKey.put(key, new Candidate(rules(conditions), candidatePokemonIds));
    }
    var allTemplates = List.copyOf(byKey.values());
    int minimum = Math.min(pool.size(), Math.max(3, (int) Math.ceil(pool.size() * .015)));
    int maximum = Math.max(minimum, (int) Math.floor(pool.size() * .48));
    var interesting = allTemplates.stream()
        .filter(template -> template.candidatePokemonIds().size() >= minimum
            && template.candidatePokemonIds().size() <= maximum)
        .toList();
    var source = !interesting.isEmpty() ? interesting : allTemplates.stream()
        .filter(template -> !template.candidatePokemonIds().isEmpty()
            && template.candidatePokemonIds().size() < pool.size())
        .toList();
    return source.stream().map(template -> {
      var view = describeBluffAuctionConditions(template.conditions());
      return new BluffAuctionConditionTemplate(bluffConditionKey(template.conditions()), template.conditions(),
          view.description(), view.clauses(), template.candidatePokemonIds());
    }).toList();
  }
}

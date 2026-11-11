package es.pokemonuniverse.domain.pokemon.conditions;

import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.function.DoubleSupplier;
import java.util.stream.Collectors;

/**
 * Traducción literal del TS que antes estaba en {@code pokemon/conditions/generator.ts}. La comparten Pokémon Bingo y
 * Pokémon Bluff Auction; cada juego pasa sus familias, su {@code maxConditions} y su {@code combinationLimit}.
 */
public final class ConditionGenerator {

  private static final List<String> STAT_KEYS =
      List.of("hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal");

  private ConditionGenerator() {}

  /** {@code quantile}: el valor del cuantil sobre los valores distintos ordenados. */
  static int quantile(List<Integer> values, double fraction) {
    var sorted = new ArrayList<>(new TreeSet<>(values));
    int index = Math.min(sorted.size() - 1, Math.max(0, (int) Math.floor((sorted.size() - 1) * fraction)));
    return sorted.get(index);
  }

  /** {@code difficulty}: la proporción de candidatos sobre el pool. */
  static ConditionDifficulty difficulty(int candidateCount, int poolSize) {
    double ratio = (double) candidateCount / poolSize;
    return ratio >= .25 ? ConditionDifficulty.EASY
        : ratio >= .08 ? ConditionDifficulty.MEDIUM
        : ConditionDifficulty.HARD;
  }

  /**
   * {@code buildConditionTemplates}: las plantillas de una y, si {@code maxConditions} es 2, de dos condiciones. Solo
   * consume {@code random} al barajar las plantillas simples antes de combinarlas.
   */
  public static List<ConditionTemplate> buildConditionTemplates(List<Pokemon> pool, ConditionGenerationOptions config,
      DoubleSupplier random) {
    int maxConditions = config.maxConditions();
    int combinationLimit = config.combinationLimit();
    var templates = new Templates(pool, maxConditions);

    if (config.family("generation")) {
      for (int generation : config.generations()) templates.add(List.of(new Condition.Generation(generation)));
    }
    if (config.family("dexNumber")) {
      var values = pool.stream().map(Pokemon::nationalDexNumber).toList();
      int q20 = quantile(values, .2);
      int q35 = quantile(values, .35);
      int q50 = quantile(values, .5);
      int q65 = quantile(values, .65);
      int q80 = quantile(values, .8);
      for (int value : List.of(q20, q35, q50, q65)) {
        templates.add(List.of(new Condition.Dex(ConditionOperator.GT, value)));
      }
      for (int value : List.of(q35, q50, q65, q80)) {
        templates.add(List.of(new Condition.Dex(ConditionOperator.LT, value)));
      }
      templates.add(List.of(Condition.Dex.range(q20, q50)));
      templates.add(List.of(Condition.Dex.range(q35, q65)));
      templates.add(List.of(Condition.Dex.range(q50, q80)));
    }
    if (config.family("type")) {
      var types = new LinkedHashSet<String>();
      for (var pokemon : pool) types.addAll(pokemon.types());
      for (var type : types) templates.add(List.of(new Condition.Type(type)));
    }
    if (config.family("typeCombination")) {
      // Map.set de JS: una combinación repetida sustituye los tipos y conserva su posición.
      var combinations = new LinkedHashMap<String, List<String>>();
      for (var pokemon : pool) {
        if (pokemon.types().size() == 2) {
          combinations.put(pokemon.types().stream().sorted().collect(Collectors.joining("+")), pokemon.types());
        }
      }
      for (var types : combinations.values()) {
        templates.add(List.of(new Condition.TypeCombination(List.of(types.get(0), types.get(1)))));
      }
    }
    if (config.family("typeCount")) {
      templates.add(List.of(new Condition.TypeCount(1)));
      templates.add(List.of(new Condition.TypeCount(2)));
    }
    for (var stat : STAT_KEYS) {
      if (!config.family(stat)) continue;
      var values = pool.stream().map(pokemon -> ConditionRules.statValue(pokemon, stat)).toList();
      for (double fraction : new double[] {.4, .55, .7}) {
        templates.add(List.of(new Condition.Stat(stat, ConditionOperator.GT, quantile(values, fraction))));
      }
      for (double fraction : new double[] {.3, .45, .6}) {
        templates.add(List.of(new Condition.Stat(stat, ConditionOperator.LT, quantile(values, fraction))));
      }
    }
    for (var entry : List.of(Map.entry("height", "heightDecimeters"), Map.entry("weight", "weightHectograms"))) {
      if (!config.family(entry.getKey())) continue;
      var metric = entry.getValue();
      var values = pool.stream().map(pokemon -> ConditionRules.physical(pokemon, metric)).toList();
      for (double fraction : new double[] {.4, .6, .75}) {
        templates.add(List.of(new Condition.Physical(metric, ConditionOperator.GT, quantile(values, fraction))));
      }
      for (double fraction : new double[] {.25, .4, .6}) {
        templates.add(List.of(new Condition.Physical(metric, ConditionOperator.LT, quantile(values, fraction))));
      }
    }
    if (config.family("evolutionStage")) {
      for (var status : List.of(ConditionEvolutionStatus.BASE, ConditionEvolutionStatus.MIDDLE,
          ConditionEvolutionStatus.FINAL, ConditionEvolutionStatus.NONE)) {
        templates.add(List.of(new Condition.Evolution(status)));
      }
    }
    if (config.family("legendaryStatus")) {
      for (var status : List.of("NORMAL", "LEGENDARY", "MYTHICAL")) {
        templates.add(List.of(new Condition.Legendary(status)));
      }
    }
    if (config.family("color")) {
      var colors = new LinkedHashSet<String>();
      for (var pokemon : pool) {
        if (pokemon.color() != null && !pokemon.color().isEmpty()) colors.add(pokemon.color());
      }
      for (var color : colors) templates.add(List.of(new Condition.Color(color)));
    }
    if (config.family("abilities")) {
      var counts = new LinkedHashMap<String, Integer>();
      for (var pokemon : pool) {
        if (pokemon.abilities() == null) continue;
        for (var ability : pokemon.abilities()) counts.merge(ability, 1, Integer::sum);
      }
      // Orden estable por apariciones descendentes, como Array.prototype.sort.
      var frequent = new ArrayList<>(counts.entrySet().stream().filter(entry -> entry.getValue() >= 2).toList());
      frequent.sort((left, right) -> right.getValue() - left.getValue());
      for (var entry : frequent.subList(0, Math.min(40, frequent.size()))) {
        templates.add(List.of(new Condition.Ability(entry.getKey())));
      }
    }

    if (maxConditions == 2) {
      var singles = Randoms.shuffled(new ArrayList<>(templates.byKey.values()), random);
      outer:
      for (int left = 0; left < singles.size(); left += 1) {
        for (int right = left + 1; right < singles.size(); right += 1) {
          var first = singles.get(left);
          var second = singles.get(right);
          var firstCondition = first.conditions().getFirst();
          var secondCondition = second.conditions().getFirst();
          if (ConditionRules.bingoConditionFamily(firstCondition)
              .equals(ConditionRules.bingoConditionFamily(secondCondition))) {
            continue;
          }
          templates.add(List.of(firstCondition, secondCondition));
          if (templates.combined >= combinationLimit) break outer;
        }
      }
    }
    return List.copyOf(templates.byKey.values());
  }

  /** El {@code Map} de plantillas y su {@code add}; cuenta las de dos condiciones en lugar de volver a filtrarlas. */
  private static final class Templates {
    private final List<Pokemon> pool;
    private final int maxConditions;
    private final Map<String, ConditionTemplate> byKey = new LinkedHashMap<>();
    private int combined;

    private Templates(List<Pokemon> pool, int maxConditions) {
      this.pool = pool;
      this.maxConditions = maxConditions;
    }

    private void add(List<Condition> conditions) {
      if (conditions.size() > maxConditions) return;
      var families = new HashSet<String>();
      for (var condition : conditions) families.add(ConditionRules.bingoConditionFamily(condition));
      if (families.size() != conditions.size()) return;
      var key = ConditionRules.bingoCellKey(conditions);
      if (byKey.containsKey(key)) return;
      var candidatePokemonIds = pool.stream()
          .filter(pokemon -> ConditionRules.pokemonMatchesBingoCell(pokemon, conditions))
          .map(Pokemon::id)
          .toList();
      if (candidatePokemonIds.size() < 2) return;
      byKey.put(key, new ConditionTemplate(conditions, key, candidatePokemonIds,
          difficulty(candidatePokemonIds.size(), pool.size())));
      if (conditions.size() == 2) combined += 1;
    }
  }
}

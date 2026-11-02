package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoCell;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoCondition;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoConditionTemplate;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoDifficulty;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoEvolutionStatus;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoOperator;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.GeneratedBingoBoard;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.DoubleSupplier;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * Traducción literal de {@code pokemon-bingo/generator.ts} y de {@code pokemon/conditions/generator.ts}. Consume
 * {@code random} como el TS: {@link #buildBingoConditionTemplates} solo baraja las plantillas simples cuando hay
 * casillas de dos condiciones, y {@link #generateBingoBoard} saca una extracción por casilla y por intento, también
 * en los intentos que se descartan.
 */
public final class PokemonBingoGenerator {

  private static final List<String> STAT_KEYS =
      List.of("hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal");
  private static final int MAX_ATTEMPTS = 500;

  private PokemonBingoGenerator() {}

  /** {@code quantile}: el valor del cuantil sobre los valores distintos ordenados. */
  static int quantile(List<Integer> values, double fraction) {
    var sorted = new ArrayList<>(new TreeSet<>(values));
    int index = Math.min(sorted.size() - 1, Math.max(0, (int) Math.floor((sorted.size() - 1) * fraction)));
    return sorted.get(index);
  }

  static BingoDifficulty difficulty(int candidateCount, int poolSize) {
    double ratio = (double) candidateCount / poolSize;
    return ratio >= .25 ? BingoDifficulty.EASY : ratio >= .08 ? BingoDifficulty.MEDIUM : BingoDifficulty.HARD;
  }

  /** {@code buildBingoConditionTemplates}: el {@code combinationLimit} depende del tamaño del cartón. */
  public static List<BingoConditionTemplate> buildBingoConditionTemplates(List<Pokemon> pool, PokemonBingoConfig config,
      DoubleSupplier random) {
    int combinationLimit = Math.min(320, Math.max(config.width() * config.height() * 12, 80));
    return buildConditionTemplates(pool, config, config.maxConditionsPerCell(), combinationLimit, random);
  }

  /** {@code buildConditionTemplates}; las familias y generaciones salen de {@code config}. */
  static List<BingoConditionTemplate> buildConditionTemplates(List<Pokemon> pool, PokemonBingoConfig config,
      int maxConditions, int combinationLimit, DoubleSupplier random) {
    var templates = new Templates(pool, maxConditions);

    if (config.family("generation")) {
      for (int generation : config.generations()) templates.add(List.of(new BingoCondition.Generation(generation)));
    }
    if (config.family("dexNumber")) {
      var values = pool.stream().map(Pokemon::nationalDexNumber).toList();
      int q20 = quantile(values, .2);
      int q35 = quantile(values, .35);
      int q50 = quantile(values, .5);
      int q65 = quantile(values, .65);
      int q80 = quantile(values, .8);
      for (int value : List.of(q20, q35, q50, q65)) {
        templates.add(List.of(new BingoCondition.Dex(BingoOperator.GT, value)));
      }
      for (int value : List.of(q35, q50, q65, q80)) {
        templates.add(List.of(new BingoCondition.Dex(BingoOperator.LT, value)));
      }
      templates.add(List.of(BingoCondition.Dex.range(q20, q50)));
      templates.add(List.of(BingoCondition.Dex.range(q35, q65)));
      templates.add(List.of(BingoCondition.Dex.range(q50, q80)));
    }
    if (config.family("type")) {
      var types = new LinkedHashSet<String>();
      for (var pokemon : pool) types.addAll(pokemon.types());
      for (var type : types) templates.add(List.of(new BingoCondition.Type(type)));
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
        templates.add(List.of(new BingoCondition.TypeCombination(List.of(types.get(0), types.get(1)))));
      }
    }
    if (config.family("typeCount")) {
      templates.add(List.of(new BingoCondition.TypeCount(1)));
      templates.add(List.of(new BingoCondition.TypeCount(2)));
    }
    for (var stat : STAT_KEYS) {
      if (!config.family(stat)) continue;
      var values = pool.stream().map(pokemon -> PokemonBingoRules.statValue(pokemon, stat)).toList();
      for (double fraction : new double[] {.4, .55, .7}) {
        templates.add(List.of(new BingoCondition.Stat(stat, BingoOperator.GT, quantile(values, fraction))));
      }
      for (double fraction : new double[] {.3, .45, .6}) {
        templates.add(List.of(new BingoCondition.Stat(stat, BingoOperator.LT, quantile(values, fraction))));
      }
    }
    for (var entry : List.of(Map.entry("height", "heightDecimeters"), Map.entry("weight", "weightHectograms"))) {
      if (!config.family(entry.getKey())) continue;
      var metric = entry.getValue();
      var values = pool.stream().map(pokemon -> PokemonBingoRules.physical(pokemon, metric)).toList();
      for (double fraction : new double[] {.4, .6, .75}) {
        templates.add(List.of(new BingoCondition.Physical(metric, BingoOperator.GT, quantile(values, fraction))));
      }
      for (double fraction : new double[] {.25, .4, .6}) {
        templates.add(List.of(new BingoCondition.Physical(metric, BingoOperator.LT, quantile(values, fraction))));
      }
    }
    if (config.family("evolutionStage")) {
      for (var status : List.of(BingoEvolutionStatus.BASE, BingoEvolutionStatus.MIDDLE, BingoEvolutionStatus.FINAL,
          BingoEvolutionStatus.NONE)) {
        templates.add(List.of(new BingoCondition.Evolution(status)));
      }
    }
    if (config.family("legendaryStatus")) {
      for (var status : List.of("NORMAL", "LEGENDARY", "MYTHICAL")) {
        templates.add(List.of(new BingoCondition.Legendary(status)));
      }
    }
    if (config.family("color")) {
      var colors = new LinkedHashSet<String>();
      for (var pokemon : pool) {
        if (pokemon.color() != null && !pokemon.color().isEmpty()) colors.add(pokemon.color());
      }
      for (var color : colors) templates.add(List.of(new BingoCondition.Color(color)));
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
        templates.add(List.of(new BingoCondition.Ability(entry.getKey())));
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
          if (PokemonBingoRules.bingoConditionFamily(firstCondition)
              .equals(PokemonBingoRules.bingoConditionFamily(secondCondition))) {
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
    private final Map<String, BingoConditionTemplate> byKey = new LinkedHashMap<>();
    private int combined;

    private Templates(List<Pokemon> pool, int maxConditions) {
      this.pool = pool;
      this.maxConditions = maxConditions;
    }

    private void add(List<BingoCondition> conditions) {
      if (conditions.size() > maxConditions) return;
      var families = new HashSet<String>();
      for (var condition : conditions) families.add(PokemonBingoRules.bingoConditionFamily(condition));
      if (families.size() != conditions.size()) return;
      var key = PokemonBingoRules.bingoCellKey(conditions);
      if (byKey.containsKey(key)) return;
      var candidatePokemonIds = pool.stream()
          .filter(pokemon -> PokemonBingoRules.pokemonMatchesBingoCell(pokemon, conditions))
          .map(Pokemon::id)
          .toList();
      if (candidatePokemonIds.size() < 2) return;
      byKey.put(key, new BingoConditionTemplate(conditions, key, candidatePokemonIds,
          difficulty(candidatePokemonIds.size(), pool.size())));
      if (conditions.size() == 2) combined += 1;
    }
  }

  /** {@code findPerfectBingoMatching}: caminos de aumento desde las casillas con menos candidatos. */
  public static Map<String, String> findPerfectBingoMatching(List<BingoCell> cells, List<Pokemon> pool) {
    var candidates = new LinkedHashMap<String, List<String>>();
    for (var cell : cells) {
      candidates.put(cell.id(), pool.stream()
          .filter(pokemon -> PokemonBingoRules.pokemonMatchesBingoCell(pokemon, cell))
          .map(Pokemon::id)
          .toList());
    }
    if (candidates.values().stream().anyMatch(List::isEmpty)) return null;
    var pokemonToCell = new LinkedHashMap<String, String>();
    var cellIds = new HashSet<String>();
    for (var cell : cells) cellIds.add(cell.id());
    var ordered = new ArrayList<>(cells);
    ordered.sort((a, b) -> candidates.get(a.id()).size() - candidates.get(b.id()).size());
    for (var cell : ordered) {
      if (!visit(cell.id(), new HashSet<>(), candidates, pokemonToCell)) return null;
    }
    var result = new LinkedHashMap<String, String>();
    for (var entry : pokemonToCell.entrySet()) {
      if (cellIds.contains(entry.getValue())) result.put(entry.getValue(), entry.getKey());
    }
    return result.size() == cells.size() ? result : null;
  }

  private static boolean visit(String cellId, Set<String> seenPokemon, Map<String, List<String>> candidates,
      Map<String, String> pokemonToCell) {
    for (var pokemonId : candidates.getOrDefault(cellId, List.of())) {
      if (!seenPokemon.add(pokemonId)) continue;
      var occupiedBy = pokemonToCell.get(pokemonId);
      if (occupiedBy == null || visit(occupiedBy, seenPokemon, candidates, pokemonToCell)) {
        pokemonToCell.put(pokemonId, cellId);
        return true;
      }
    }
    return false;
  }

  /**
   * {@code generateBingoBoard}: cada casilla elige plantilla con
   * {@code options[(Math.floor(random() * options.length) + salt) % options.length]} (no es {@code randomItem}: lleva
   * {@code salt} y no recorta el índice).
   */
  public static GeneratedBingoBoard generateBingoBoard(List<BingoConditionTemplate> templates, List<Pokemon> pool,
      int width, int height, DoubleSupplier random, Set<String> forbiddenSignatures, int variant) {
    int cellCount = width * height;
    if (templates.size() < cellCount) {
      throw new EngineException("No se puede generar un tablero " + width + "×" + height + ": solo hay "
          + templates.size() + " condiciones distintas válidas.");
    }
    boolean anyCombined = templates.stream().anyMatch(template -> template.conditions().size() == 2);
    for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      var used = new HashSet<String>();
      var cells = new ArrayList<BingoCell>();
      for (int index = 0; index < cellCount; index += 1) {
        var tier = index % 7 == 0 ? BingoDifficulty.HARD
            : index % 3 == 0 ? BingoDifficulty.MEDIUM
            : BingoDifficulty.EASY;
        int wanted = anyCombined && index % 3 == 0 ? 2 : 1;
        var options = filter(templates, template -> !used.contains(template.key()) && template.difficulty() == tier
            && template.conditions().size() == wanted);
        if (options.isEmpty()) {
          options = filter(templates, template -> !used.contains(template.key())
              && template.conditions().size() == wanted);
        }
        if (options.isEmpty()) options = filter(templates, template -> !used.contains(template.key()));
        if (options.isEmpty()) break;
        int salt = variant + attempt * cellCount + index;
        var selected = options.get(((int) Math.floor(random.getAsDouble() * options.size()) + salt) % options.size());
        used.add(selected.key());
        cells.add(new BingoCell("cell-" + (index + 1), selected.conditions()));
      }
      if (cells.size() != cellCount) continue;
      var signature = cells.stream().map(cell -> PokemonBingoRules.bingoCellKey(cell.conditions()))
          .collect(Collectors.joining("|"));
      if (forbiddenSignatures.contains(signature)) continue;
      var solutionPokemonIds = findPerfectBingoMatching(cells, pool);
      if (solutionPokemonIds != null) return new GeneratedBingoBoard(cells, solutionPokemonIds, signature);
    }
    throw new EngineException("No se puede generar un tablero " + width + "×" + height
        + " globalmente resoluble con esta configuración. Activa más generaciones o familias de condiciones.");
  }

  private static List<BingoConditionTemplate> filter(List<BingoConditionTemplate> templates,
      Predicate<BingoConditionTemplate> keep) {
    return templates.stream().filter(keep).toList();
  }
}

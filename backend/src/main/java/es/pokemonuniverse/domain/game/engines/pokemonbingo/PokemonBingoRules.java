package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import com.ibm.icu.number.LocalizedNumberFormatter;
import com.ibm.icu.number.NumberFormatter;
import com.ibm.icu.number.Precision;
import com.ibm.icu.util.ULocale;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoCell;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoCondition;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoEvolutionStatus;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoOperator;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Traducción literal de {@code pokemon-bingo/rules.ts} y de {@code pokemon/conditions/rules.ts}, que el motor TS
 * reexporta (solo Pokémon Bingo usa ese módulo), más el formato {@code toLocaleString('es-ES')}.
 */
public final class PokemonBingoRules {

  private static final Map<String, String> TYPE_LABELS = Map.ofEntries(
      Map.entry("normal", "Normal"), Map.entry("fire", "Fuego"), Map.entry("water", "Agua"),
      Map.entry("electric", "Eléctrico"), Map.entry("grass", "Planta"), Map.entry("ice", "Hielo"),
      Map.entry("fighting", "Lucha"), Map.entry("poison", "Veneno"), Map.entry("ground", "Tierra"),
      Map.entry("flying", "Volador"), Map.entry("psychic", "Psíquico"), Map.entry("bug", "Bicho"),
      Map.entry("rock", "Roca"), Map.entry("ghost", "Fantasma"), Map.entry("dragon", "Dragón"),
      Map.entry("dark", "Siniestro"), Map.entry("steel", "Acero"), Map.entry("fairy", "Hada"));
  private static final Map<String, String> STAT_LABELS = Map.of(
      "hp", "HP", "attack", "Ataque", "defense", "Defensa", "specialAttack", "At. Especial",
      "specialDefense", "Def. Especial", "speed", "Velocidad", "baseStatTotal", "Total stats");
  private static final Map<String, String> LEGENDARY_LABELS =
      Map.of("NORMAL", "No legendario", "LEGENDARY", "Legendario", "MYTHICAL", "Mítico");
  private static final Map<BingoEvolutionStatus, String> EVOLUTION_LABELS = Map.of(
      BingoEvolutionStatus.BASE, "Pokémon base", BingoEvolutionStatus.MIDDLE, "Evolución intermedia",
      BingoEvolutionStatus.FINAL, "Evolución final", BingoEvolutionStatus.NONE, "No evoluciona");

  /**
   * {@code Number.prototype.toLocaleString('es-ES')} con las opciones por defecto de {@code Intl.NumberFormat}: hasta
   * 3 decimales con redondeo {@code halfExpand} y agrupación según CLDR ({@code es} agrupa solo a partir de 5 cifras
   * enteras). ICU4J es la misma biblioteca que usa Node; el formateador es inmutable.
   */
  private static final LocalizedNumberFormatter ES_ES = NumberFormatter.withLocale(ULocale.forLanguageTag("es-ES"))
      .precision(Precision.minMaxFraction(0, 3))
      .roundingMode(RoundingMode.HALF_UP);

  private PokemonBingoRules() {}

  /** {@code toLocaleString('es-ES')} de un número. */
  static String formatEs(double value) {
    return ES_ES.format(value).toString();
  }

  /** {@code ${label}} de un {@code Record} de TS: una clave ausente se interpola como {@code undefined}. */
  private static String label(Map<String, String> labels, String key) {
    var value = labels.get(key);
    return value == null ? "undefined" : value;
  }

  /**
   * {@code hasCompleteBingoMetadata}: cada familia activa exige su dato ({@code Boolean(...)} de JS: un texto vacío o
   * un {@code 0} cuentan como ausentes).
   */
  public static boolean hasCompleteBingoMetadata(Pokemon pokemon, PokemonBingoConfig config) {
    return (!config.family("height") || pokemon.heightDecimeters() > 0)
        && (!config.family("weight") || pokemon.weightHectograms() > 0)
        && (!config.family("evolutionStage") || (nonZero(pokemon.evolutionStage())
            && nonZero(pokemon.evolutionStageCount())))
        && (!config.family("legendaryStatus") || nonEmpty(pokemon.legendaryStatus()))
        && (!config.family("color") || (nonEmpty(pokemon.color()) && !pokemon.color().equals("unknown")))
        && (!config.family("abilities") || (pokemon.abilities() != null && !pokemon.abilities().isEmpty()));
  }

  private static boolean nonZero(Integer value) {
    return value != null && value != 0;
  }

  private static boolean nonEmpty(String value) {
    return value != null && !value.isEmpty();
  }

  /** {@code bingoWords}: cada palabra separada por guiones, con la primera unidad UTF-16 en mayúscula. */
  public static String bingoWords(String value) {
    var words = new ArrayList<String>();
    for (var word : value.split("-", -1)) {
      if (word.isEmpty()) throw new EngineException("Cannot read properties of undefined (reading 'toUpperCase')");
      words.add(word.substring(0, 1).toUpperCase(Locale.ROOT) + word.substring(1));
    }
    return String.join(" ", words);
  }

  /** {@code bingoConditionFamily}. */
  public static String bingoConditionFamily(BingoCondition condition) {
    return switch (condition) {
      case BingoCondition.Generation ignored -> "generation";
      case BingoCondition.Dex ignored -> "dexNumber";
      case BingoCondition.Type ignored -> "type";
      case BingoCondition.TypeCombination ignored -> "typeCombination";
      case BingoCondition.TypeCount ignored -> "typeCount";
      case BingoCondition.Stat stat -> stat.stat();
      case BingoCondition.Physical physical -> physical.metric().equals("heightDecimeters") ? "height" : "weight";
      case BingoCondition.Evolution ignored -> "evolutionStage";
      case BingoCondition.Legendary ignored -> "legendaryStatus";
      case BingoCondition.Color ignored -> "color";
      case BingoCondition.Ability ignored -> "abilities";
    };
  }

  /** {@code bingoConditionKey}; {@code TYPES} ordena los tipos con el {@code sort()} por defecto (UTF-16). */
  public static String bingoConditionKey(BingoCondition condition) {
    return switch (condition) {
      case BingoCondition.Generation generation -> "GEN:" + generation.generation();
      case BingoCondition.Dex dex -> "DEX:" + dex.operator() + ":" + dex.value() + ":"
          + (dex.max() == null ? "" : dex.max());
      case BingoCondition.Type type -> "TYPE:" + type.pokemonType();
      case BingoCondition.TypeCombination combination ->
          "TYPES:" + combination.pokemonTypes().stream().sorted().collect(Collectors.joining("+"));
      case BingoCondition.TypeCount count -> "TYPE_COUNT:" + count.count();
      case BingoCondition.Stat stat -> "STAT:" + stat.stat() + ":" + stat.operator() + ":" + stat.value();
      case BingoCondition.Physical physical ->
          "PHYSICAL:" + physical.metric() + ":" + physical.operator() + ":" + physical.value();
      case BingoCondition.Evolution evolution -> "EVOLUTION:" + evolution.status();
      case BingoCondition.Legendary legendary -> "LEGENDARY:" + legendary.status();
      case BingoCondition.Color color -> "COLOR:" + color.color();
      case BingoCondition.Ability ability -> "ABILITY:" + ability.ability();
    };
  }

  /** {@code bingoCellKey}: las claves de las condiciones ordenadas y unidas con {@code &}. */
  public static String bingoCellKey(List<BingoCondition> conditions) {
    return conditions.stream().map(PokemonBingoRules::bingoConditionKey).sorted().collect(Collectors.joining("&"));
  }

  private static String symbol(BingoOperator operator) {
    return operator == BingoOperator.GT ? ">" : "<";
  }

  /** {@code describeBingoCondition}. */
  public static String describeBingoCondition(BingoCondition condition) {
    return switch (condition) {
      case BingoCondition.Generation generation -> "Generación " + generation.generation();
      case BingoCondition.Dex dex -> dex.operator() == BingoOperator.RANGE
          ? "Pokédex " + dex.value() + "–" + (dex.max() == null ? "undefined" : dex.max())
          : "Pokédex " + symbol(dex.operator()) + " " + dex.value();
      case BingoCondition.Type type -> "Tipo " + label(TYPE_LABELS, type.pokemonType());
      case BingoCondition.TypeCombination combination -> combination.pokemonTypes().stream()
          .map(pokemonType -> label(TYPE_LABELS, pokemonType)).collect(Collectors.joining(" + "));
      case BingoCondition.TypeCount count -> count.count() == 1 ? "Monotipo" : "Doble tipo";
      case BingoCondition.Stat stat ->
          label(STAT_LABELS, stat.stat()) + " " + symbol(stat.operator()) + " " + stat.value();
      case BingoCondition.Physical physical -> {
        int divisor = 10;
        boolean height = physical.metric().equals("heightDecimeters");
        yield (height ? "Altura" : "Peso") + " " + symbol(physical.operator()) + " "
            + formatEs(physical.value() / (double) divisor) + " " + (height ? "m" : "kg");
      }
      case BingoCondition.Evolution evolution -> EVOLUTION_LABELS.get(evolution.status());
      case BingoCondition.Legendary legendary -> label(LEGENDARY_LABELS, legendary.status());
      case BingoCondition.Color color -> "Color principal: " + bingoWords(color.color());
      case BingoCondition.Ability ability -> "Puede tener " + bingoWords(ability.ability());
    };
  }

  private static boolean compare(int value, BingoOperator operator, int threshold) {
    return operator == BingoOperator.GT ? value > threshold : value < threshold;
  }

  /** {@code pokemon[stat]} de un {@code BingoStatKey}. */
  static int statValue(Pokemon pokemon, String stat) {
    return switch (stat) {
      case "hp" -> pokemon.hp();
      case "attack" -> pokemon.attack();
      case "defense" -> pokemon.defense();
      case "specialAttack" -> pokemon.specialAttack();
      case "specialDefense" -> pokemon.specialDefense();
      case "speed" -> pokemon.speed();
      case "baseStatTotal" -> pokemon.baseStatTotal();
      default -> throw new EngineException("Estadística desconocida: " + stat);
    };
  }

  /** {@code pokemon[metric] ?? 0}. */
  static int physical(Pokemon pokemon, String metric) {
    return metric.equals("heightDecimeters") ? pokemon.heightDecimeters() : pokemon.weightHectograms();
  }

  /** {@code pokemonMatchesBingoCondition}. */
  public static boolean pokemonMatchesBingoCondition(Pokemon pokemon, BingoCondition condition) {
    return switch (condition) {
      case BingoCondition.Generation generation -> pokemon.generation() == generation.generation();
      case BingoCondition.Dex dex -> dex.operator() == BingoOperator.RANGE
          ? pokemon.nationalDexNumber() >= dex.value()
              && pokemon.nationalDexNumber() <= (dex.max() == null ? dex.value() : dex.max())
          : compare(pokemon.nationalDexNumber(), dex.operator(), dex.value());
      case BingoCondition.Type type -> pokemon.types().contains(type.pokemonType());
      case BingoCondition.TypeCombination combination -> {
        var expected = new HashSet<>(combination.pokemonTypes());
        yield pokemon.types().size() == 2 && expected.containsAll(pokemon.types());
      }
      case BingoCondition.TypeCount count -> pokemon.types().size() == count.count();
      case BingoCondition.Stat stat -> compare(statValue(pokemon, stat.stat()), stat.operator(), stat.value());
      case BingoCondition.Physical physical ->
          compare(physical(pokemon, physical.metric()), physical.operator(), physical.value());
      case BingoCondition.Evolution evolution -> {
        int stage = pokemon.evolutionStage() == null ? 1 : pokemon.evolutionStage();
        int stages = pokemon.evolutionStageCount() == null ? 1 : pokemon.evolutionStageCount();
        yield switch (evolution.status()) {
          case NONE -> stages == 1;
          case BASE -> stages > 1 && stage == 1;
          case MIDDLE -> stage > 1 && stage < stages;
          case FINAL -> stages > 1 && stage == stages;
        };
      }
      case BingoCondition.Legendary legendary ->
          (pokemon.legendaryStatus() == null ? "NORMAL" : pokemon.legendaryStatus()).equals(legendary.status());
      case BingoCondition.Color color -> color.color().equals(pokemon.color());
      case BingoCondition.Ability ability ->
          pokemon.abilities() != null && pokemon.abilities().contains(ability.ability());
    };
  }

  /** {@code pokemonMatchesBingoCell}: todas las condiciones de la casilla. */
  public static boolean pokemonMatchesBingoCell(Pokemon pokemon, List<BingoCondition> conditions) {
    for (var condition : conditions) {
      if (!pokemonMatchesBingoCondition(pokemon, condition)) return false;
    }
    return true;
  }

  /** {@code pokemonMatchesBingoCell} de una casilla. */
  public static boolean pokemonMatchesBingoCell(Pokemon pokemon, BingoCell cell) {
    return pokemonMatchesBingoCell(pokemon, cell.conditions());
  }
}

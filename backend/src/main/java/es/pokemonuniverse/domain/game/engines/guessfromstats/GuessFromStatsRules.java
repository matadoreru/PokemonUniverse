package es.pokemonuniverse.domain.game.engines.guessfromstats;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsEvolution;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsHint;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsPlayerStats;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsState;
import es.pokemonuniverse.domain.game.engines.guessfromstats.GuessFromStatsTypes.GuessFromStatsVisibleStat;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.TreeSet;

/** Traducción literal del TS que antes estaba en {@code guess-from-stats/rules.ts}. */
public final class GuessFromStatsRules {

  /** {@code statOrder}: claves de TS en el orden en que se muestran. */
  static final List<String> STAT_ORDER =
      List.of("hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "bst");

  private GuessFromStatsRules() {}

  /** Suma de las seis estadísticas (no el {@code baseStatTotal} del catálogo). */
  public static int pokemonBaseStatTotal(Pokemon pokemon) {
    return pokemon.hp() + pokemon.attack() + pokemon.defense() + pokemon.specialAttack() + pokemon.specialDefense()
        + pokemon.speed();
  }

  public static int guessFromStatsValue(Pokemon pokemon, String key) {
    return switch (key) {
      case "hp" -> pokemon.hp();
      case "attack" -> pokemon.attack();
      case "defense" -> pokemon.defense();
      case "specialAttack" -> pokemon.specialAttack();
      case "specialDefense" -> pokemon.specialDefense();
      case "speed" -> pokemon.speed();
      case "bst" -> pokemonBaseStatTotal(pokemon);
      default -> throw new IllegalArgumentException("Estadística desconocida: " + key);
    };
  }

  public static List<GuessFromStatsVisibleStat> buildVisibleStats(Pokemon pokemon, GuessFromStatsConfig config) {
    return STAT_ORDER.stream()
        .filter(key -> config.stats().enabled(key))
        .map(key -> new GuessFromStatsVisibleStat(key, guessFromStatsValue(pokemon, key)))
        .toList();
  }

  /** {@code !stage || !stages}: nulo o 0 no tiene datos de evolución. */
  public static @Nullable GuessFromStatsEvolution normalizeEvolution(Pokemon pokemon) {
    var stage = pokemon.evolutionStage();
    var stages = pokemon.evolutionStageCount();
    if (stage == null || stage == 0 || stages == null || stages == 0) return null;
    if (stages <= 1) return GuessFromStatsEvolution.NO_EVOLUTION;
    if (stage <= 1) return GuessFromStatsEvolution.BASE;
    if (stage >= stages) return GuessFromStatsEvolution.FINAL;
    return GuessFromStatsEvolution.MIDDLE;
  }

  /**
   * {@code hasGuessFromStatsHintData}. Altura y peso son enteros en el record Java ({@code typeof … === 'number'}
   * siempre cierto); la categoría exige una cadena no vacía ({@code Boolean(legendaryStatus)}).
   */
  public static boolean hasHintData(Pokemon pokemon, GuessFromStatsConfig config) {
    if (!config.hintsEnabled()) return true;
    var hints = config.hints();
    return (!hints.evolution() || normalizeEvolution(pokemon) != null)
        && (!hints.category() || JsStrings.truthy(pokemon.legendaryStatus()));
  }

  /** {@code [...new Set(types)].sort()}: orden por unidades UTF-16, el de {@link String#compareTo}. */
  private static List<String> sortedDistinctTypes(List<String> types) {
    return new ArrayList<>(new TreeSet<>(types));
  }

  public static List<GuessFromStatsHint> buildHints(Pokemon pokemon, GuessFromStatsConfig config) {
    if (!config.hintsEnabled()) return List.of();
    var enabled = config.hints();
    var hints = new ArrayList<GuessFromStatsHint>();
    if (enabled.generation()) hints.add(new GuessFromStatsHint.Generation(pokemon.generation()));
    if (enabled.types()) hints.add(new GuessFromStatsHint.Types(sortedDistinctTypes(pokemon.types())));
    if (enabled.typeCount()) hints.add(new GuessFromStatsHint.TypeCount(new TreeSet<>(pokemon.types()).size()));
    var evolution = normalizeEvolution(pokemon);
    if (enabled.evolution() && evolution != null) hints.add(new GuessFromStatsHint.Evolution(evolution));
    if (enabled.height()) hints.add(new GuessFromStatsHint.Height(pokemon.heightDecimeters()));
    if (enabled.weight()) hints.add(new GuessFromStatsHint.Weight(pokemon.weightHectograms()));
    if (enabled.category() && JsStrings.truthy(pokemon.legendaryStatus())) {
      hints.add(new GuessFromStatsHint.Category(pokemon.legendaryStatus()));
    }
    return hints;
  }

  /** {@code buildGuessFromStatsSignature}: estadísticas y pistas visibles unidas por {@code |}. */
  public static String buildSignature(Pokemon pokemon, GuessFromStatsConfig config) {
    var parts = new ArrayList<String>();
    for (var stat : buildVisibleStats(pokemon, config)) parts.add(stat.key() + ":" + stat.value());
    for (var hint : buildHints(pokemon, config)) {
      parts.add(switch (hint) {
        case GuessFromStatsHint.Types types -> "types:" + String.join(",", sortedDistinctTypes(types.value()));
        case GuessFromStatsHint.Evolution evolution -> label(hint) + evolution.value();
        case GuessFromStatsHint.Generation generation -> label(hint) + generation.value();
        case GuessFromStatsHint.TypeCount typeCount -> label(hint) + typeCount.value();
        case GuessFromStatsHint.Category category -> label(hint) + category.value();
        case GuessFromStatsHint.Height height -> "height:" + height.decimeters();
        case GuessFromStatsHint.Weight weight -> "weight:" + weight.hectograms();
      });
    }
    return String.join("|", parts);
  }

  /** {@code `${hint.kind.toLowerCase()}:`}. */
  private static String label(GuessFromStatsHint hint) {
    return hint.kind().toLowerCase(Locale.ROOT) + ":";
  }

  public static int roundPoints(int playerCount, int solveOrder) {
    return Scoring.pointsForPosition(playerCount, solveOrder);
  }

  /**
   * Clasificación final: puntos, primeros puestos y aciertos descendentes, intentos ascendentes y, al final,
   * {@code playerId.localeCompare}, aquí {@link String#compareTo} (equivalente sobre ids de jugador, regla 21 del README
   * de motores). Sin {@code mapStats}: las estadísticas se copian tal cual ({@code { ...entry.stats }}).
   */
  public static GameResults buildGuessFromStatsResults(GuessFromStatsState state) {
    if (state.phase() != GamePhase.GAME_RESULTS) {
      throw new EngineException("Results are unavailable before the game finishes");
    }
    var entries = state.playerIds().stream()
        .map(playerId -> new Scoring.ScoreEntry<>(playerId, state.scores().getOrDefault(playerId, 0),
            state.playerStats().getOrDefault(playerId, GuessFromStatsPlayerStats.ZERO)))
        .toList();
    Comparator<Scoring.ScoreEntry<GuessFromStatsPlayerStats>> compare = Comparator
        .<Scoring.ScoreEntry<GuessFromStatsPlayerStats>>comparingInt(entry -> -entry.points())
        .thenComparingInt(entry -> -entry.stats().roundFirsts())
        .thenComparingInt(entry -> -entry.stats().correct())
        .thenComparingInt(entry -> entry.stats().totalAttempts())
        .thenComparing(Scoring.ScoreEntry::playerId);
    return Scoring.buildRankedResults(entries, compare,
        entry -> entry.points() + ":" + entry.stats().roundFirsts() + ":" + entry.stats().correct() + ":"
            + entry.stats().totalAttempts(),
        entry -> {
          var stats = entry.stats();
          var mapped = new LinkedHashMap<String, Number>();
          mapped.put("correct", stats.correct());
          mapped.put("missed", stats.missed());
          mapped.put("totalAttempts", stats.totalAttempts());
          mapped.put("firstTry", stats.firstTry());
          mapped.put("roundFirsts", stats.roundFirsts());
          mapped.put("solveTimeTotalMs", stats.solveTimeTotalMs());
          mapped.put("bestTimeMs", stats.bestTimeMs());
          mapped.put("pointsFromRounds", stats.pointsFromRounds());
          return mapped;
        });
  }
}

package es.pokemonuniverse.domain.game.engines.tcghigherlower;

import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerChoice;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerState;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerTypes.TcgHigherLowerStats;
import java.util.Comparator;
import java.util.LinkedHashMap;

/** Traducción literal del TS que antes estaba en {@code tcg-higher-lower/rules.ts}. */
public final class TcgHigherLowerRules {

  /** Lo que vale acertar {@code SAME}. */
  public static final int SAME_POINTS = 2;

  /** Lo que vale acertar {@code HIGHER} o {@code LOWER}. */
  public static final int CORRECT_POINTS = 1;

  private TcgHigherLowerRules() {}

  /** {@code tcgPriceComparison}: cómo es el precio actual respecto al anterior. */
  public static TcgHigherLowerChoice tcgPriceComparison(String previous, String current) {
    int comparison = TcgHigherLowerConfig.compareTcgPrices(current, previous);
    return comparison > 0 ? TcgHigherLowerChoice.HIGHER
        : comparison < 0 ? TcgHigherLowerChoice.LOWER : TcgHigherLowerChoice.SAME;
  }

  /**
   * Clasificación por puntos, mejor racha y aciertos, sin desempate por id: la ordenación estable de
   * {@link java.util.List#sort} conserva el orden de {@code playerIds}, como {@code Array.prototype.sort}. A diferencia
   * de otros juegos, TS no comprueba la fase.
   */
  public static GameResults buildTcgHigherLowerResults(TcgHigherLowerState state) {
    var entries = Scoring.scoreEntries(state.playerIds(), state.scores(),
        playerId -> state.playerStats().get(playerId));
    Comparator<Scoring.ScoreEntry<TcgHigherLowerStats>> compare = (left, right) -> {
      int byPoints = Integer.compare(right.points(), left.points());
      if (byPoints != 0) return byPoints;
      int byStreak = Integer.compare(right.stats().bestStreak(), left.stats().bestStreak());
      return byStreak != 0 ? byStreak : Integer.compare(right.stats().correct(), left.stats().correct());
    };
    return Scoring.buildRankedResults(entries, compare,
        entry -> entry.points() + ":" + entry.stats().bestStreak() + ":" + entry.stats().correct(),
        entry -> {
          var stats = entry.stats();
          var mapped = new LinkedHashMap<String, Number>();
          mapped.put("comparisons", stats.comparisons());
          mapped.put("correct", stats.correct());
          mapped.put("incorrect", stats.incorrect());
          mapped.put("sameCorrect", stats.sameCorrect());
          mapped.put("answered", stats.answered());
          mapped.put("bestStreak", stats.bestStreak());
          mapped.put("accuracy", stats.comparisons() != 0
              ? (int) Math.round((double) stats.correct() / stats.comparisons() * 100) : 0);
          return mapped;
        });
  }
}

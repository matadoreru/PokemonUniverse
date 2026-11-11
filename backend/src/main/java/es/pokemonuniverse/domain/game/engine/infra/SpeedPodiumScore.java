package es.pokemonuniverse.domain.game.engine.infra;

import java.util.Arrays;
import java.util.List;

/**
 * {@code pokemonCryScore}, {@code whoPokemonScore} y {@code pokemonPaletteScore}: de 1 a 10 puntos por rapidez más
 * la bonificación de podio (3, 2, 1) de los tres primeros en acertar. Con rachas ({@code streakBonus} en la
 * configuración), {@link #streakBonus} suma además lo de la racha.
 */
public record SpeedPodiumScore(int speedPoints, int placementBonus, int totalPoints) {

  public static final int MAX_SPEED_POINTS = 10;
  public static final int MIN_SPEED_POINTS = 1;
  private static final int[] PODIUM_BONUSES = {3, 2, 1};
  /** Tope de la bonificación de racha. */
  public static final int MAX_STREAK_BONUS = 3;

  /** Bonificaciones de podio, de la primera a la última posición premiada. */
  public static List<Integer> podiumBonuses() {
    return Arrays.stream(PODIUM_BONUSES).boxed().toList();
  }

  /**
   * Bonificación de racha de un acierto que deja {@code consecutiveSolves} rondas seguidas acertadas (esta incluida):
   * ninguna en la primera, +1 en la segunda, +2 en la tercera y {@link #MAX_STREAK_BONUS} desde la cuarta.
   */
  public static int streakBonus(int consecutiveSolves) {
    return Math.max(0, Math.min(MAX_STREAK_BONUS, consecutiveSolves - 1));
  }

  /** La proporción restante es una división en coma flotante, como en JS. */
  public static SpeedPodiumScore of(long roundStartedAt, int roundSeconds, long solvedAt, int solveOrder) {
    long duration = roundSeconds * 1_000L;
    long elapsed = Math.max(0, Math.min(duration, solvedAt - roundStartedAt));
    double remainingRatio = Math.max(0, 1 - (double) elapsed / duration);
    int speedPoints = Math.max(MIN_SPEED_POINTS, (int) Math.ceil(remainingRatio * MAX_SPEED_POINTS));
    int placementBonus = solveOrder >= 1 && solveOrder <= PODIUM_BONUSES.length ? PODIUM_BONUSES[solveOrder - 1] : 0;
    return new SpeedPodiumScore(speedPoints, placementBonus, speedPoints + placementBonus);
  }
}

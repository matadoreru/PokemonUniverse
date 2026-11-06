package es.pokemonuniverse.domain.game.engine.infra;

import io.micronaut.core.annotation.Nullable;
import java.util.List;
import java.util.function.Function;

/** Traducción literal de {@code games/infrastructure/guessing-round.ts}: contabilidad común de aciertos. */
public final class GuessingRound {

  private GuessingRound() {}

  /** Las respuestas aceptadas y la política de puntos siguen siendo del juego. */
  public static <T extends GuessSolveStats<T>> T recordGuessSolve(T stats, int attemptCount, int solveOrder,
      long elapsedMs, int points) {
    return stats.withSolve(
        stats.correct() + 1,
        stats.totalAttempts() + 1,
        stats.firstTry() + (attemptCount == 1 ? 1 : 0),
        stats.roundFirsts() + (solveOrder == 1 ? 1 : 0),
        stats.solveTimeTotalMs() + elapsedMs,
        stats.bestTimeMs() <= 0 ? elapsedMs : Math.min(stats.bestTimeMs(), elapsedMs),
        stats.pointsFromRounds() + points);
  }

  /**
   * Fallos de la ronda en la vista pública: todos con {@code publicAttempts}; si no, ninguno (nadie ve los fallos de
   * los demás).
   */
  public static <T> List<T> publicAttempts(boolean publicAttempts, List<T> attempts) {
    return publicAttempts ? attempts : List.of();
  }

  /**
   * Fallos propios en la vista de {@code playerId}: {@code null} (no se envía) con {@code publicAttempts}, porque ya
   * van en la vista pública; si no, solo los suyos.
   */
  public static <T> @Nullable List<T> ownAttempts(boolean publicAttempts, List<T> attempts,
      Function<T, String> playerOf, String playerId) {
    if (publicAttempts) return null;
    return attempts.stream().filter(attempt -> playerId.equals(playerOf.apply(attempt))).toList();
  }
}

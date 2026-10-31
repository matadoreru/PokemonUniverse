package es.pokemonuniverse.domain.game.engine.infra;

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
}

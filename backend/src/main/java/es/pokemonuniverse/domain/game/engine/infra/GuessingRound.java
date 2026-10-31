package es.pokemonuniverse.domain.game.engine.infra;

/** Traducción literal de {@code games/infrastructure/guessing-round.ts}: contabilidad común de aciertos. */
public final class GuessingRound {

  public record GuessSolveStats(int correct, int totalAttempts, int firstTry, int roundFirsts, long solveTimeTotalMs,
      long bestTimeMs, int pointsFromRounds) {

    public static final GuessSolveStats EMPTY = new GuessSolveStats(0, 0, 0, 0, 0, 0, 0);
  }

  private GuessingRound() {}

  public static GuessSolveStats recordGuessSolve(GuessSolveStats stats, int attemptCount, int solveOrder, long elapsedMs,
      int points) {
    return new GuessSolveStats(
        stats.correct() + 1,
        stats.totalAttempts() + 1,
        stats.firstTry() + (attemptCount == 1 ? 1 : 0),
        stats.roundFirsts() + (solveOrder == 1 ? 1 : 0),
        stats.solveTimeTotalMs() + elapsedMs,
        stats.bestTimeMs() <= 0 ? elapsedMs : Math.min(stats.bestTimeMs(), elapsedMs),
        stats.pointsFromRounds() + points);
  }
}

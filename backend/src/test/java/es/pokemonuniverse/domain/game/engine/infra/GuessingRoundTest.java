package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;

import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import org.junit.jupiter.api.Test;

class GuessingRoundTest {

  /** Como las estadísticas de guess-from-stats: los siete contadores comunes más {@code missed}. */
  private record Stats(int correct, int missed, int totalAttempts, int firstTry, int roundFirsts, long solveTimeTotalMs,
      long bestTimeMs, int pointsFromRounds) implements GuessSolveStats<Stats> {

    @Override
    public Stats withSolve(int correct, int totalAttempts, int firstTry, int roundFirsts, long solveTimeTotalMs,
        long bestTimeMs, int pointsFromRounds) {
      return new Stats(correct, missed, totalAttempts, firstTry, roundFirsts, solveTimeTotalMs, bestTimeMs,
          pointsFromRounds);
    }
  }

  @Test
  void recordsSolveAccountingAndKeepsGameFields() {
    var first = GuessingRound.recordGuessSolve(new Stats(0, 2, 0, 0, 0, 0, 0, 0), 1, 1, 4_000, 10);
    assertEquals(new Stats(1, 2, 1, 1, 1, 4_000, 4_000, 10), first);
    var second = GuessingRound.recordGuessSolve(first, 3, 2, 6_000, 5);
    assertEquals(new Stats(2, 2, 2, 1, 1, 10_000, 4_000, 15), second);
    assertEquals(2_000, GuessingRound.recordGuessSolve(second, 1, 1, 2_000, 0).bestTimeMs());
  }

  @Test
  void guideSeesEveryAttemptOnlyWhenTheyAreNotPublic() {
    var attempts = List.of("a", "b");
    assertEquals(attempts, GuessingRound.guideAttempts(false, attempts));
    assertNull(GuessingRound.guideAttempts(true, attempts));
  }
}

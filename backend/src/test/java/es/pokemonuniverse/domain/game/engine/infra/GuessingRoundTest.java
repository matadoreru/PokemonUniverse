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

  private record Attempt(String playerId, String pokemonId) {}

  private static final List<Attempt> ATTEMPTS = List.of(new Attempt("p1", "pidgey"), new Attempt("p2", "rattata"),
      new Attempt("p1", "zubat"));

  /** Con los intentos públicos, la vista pública los lleva todos; si no, ninguno. */
  @Test
  void publicAttemptsAreAllOrNothing() {
    assertEquals(ATTEMPTS, GuessingRound.publicAttempts(true, ATTEMPTS));
    assertEquals(List.of(), GuessingRound.publicAttempts(false, ATTEMPTS));
  }

  /** Sin intentos públicos, cada jugador recibe solo los suyos, en orden; con ellos, la vista propia no los repite. */
  @Test
  void ownAttemptsFilterOutEveryoneElse() {
    assertEquals(List.of(ATTEMPTS.get(0), ATTEMPTS.get(2)),
        GuessingRound.ownAttempts(false, ATTEMPTS, Attempt::playerId, "p1"));
    assertEquals(List.of(ATTEMPTS.get(1)), GuessingRound.ownAttempts(false, ATTEMPTS, Attempt::playerId, "p2"));
    assertEquals(List.of(), GuessingRound.ownAttempts(false, ATTEMPTS, Attempt::playerId, "p3"));
    assertNull(GuessingRound.ownAttempts(true, ATTEMPTS, Attempt::playerId, "p1"));
  }
}

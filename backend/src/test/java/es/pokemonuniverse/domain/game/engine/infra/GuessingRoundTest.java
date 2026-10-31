package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.domain.game.engine.infra.GuessingRound.GuessSolveStats;
import org.junit.jupiter.api.Test;

class GuessingRoundTest {

  @Test
  void recordsSolveAccounting() {
    var first = GuessingRound.recordGuessSolve(GuessSolveStats.EMPTY, 1, 1, 4_000, 10);
    assertEquals(new GuessSolveStats(1, 1, 1, 1, 4_000, 4_000, 10), first);
    var second = GuessingRound.recordGuessSolve(first, 3, 2, 6_000, 5);
    assertEquals(new GuessSolveStats(2, 2, 1, 1, 10_000, 4_000, 15), second);
    assertEquals(2_000, GuessingRound.recordGuessSolve(second, 1, 1, 2_000, 0).bestTimeMs());
  }
}

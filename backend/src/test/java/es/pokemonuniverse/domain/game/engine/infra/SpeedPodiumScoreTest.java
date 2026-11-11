package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SpeedPodiumScoreTest {

  @Test
  void addsTheSpeedPointsAndThePodiumBonus() {
    assertEquals(new SpeedPodiumScore(10, 3, 13), SpeedPodiumScore.of(1_000, 20, 1_000, 1));
    // 5 s de 20: quedan 0,75 → ceil(7,5) = 8.
    assertEquals(new SpeedPodiumScore(8, 2, 10), SpeedPodiumScore.of(1_000, 20, 6_000, 2));
    assertEquals(new SpeedPodiumScore(1, 1, 2), SpeedPodiumScore.of(1_000, 20, 99_000, 3));
    assertEquals(new SpeedPodiumScore(10, 0, 10), SpeedPodiumScore.of(1_000, 20, 500, 4));
  }
}

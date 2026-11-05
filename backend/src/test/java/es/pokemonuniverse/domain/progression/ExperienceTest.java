package es.pokemonuniverse.domain.progression;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ExperienceTest {

  @Test
  void baseForPlayingPlusBonusByPosition() {
    assertEquals(50, Experience.xpForGame(1, 4));
    assertEquals(40, Experience.xpForGame(2, 4));
    assertEquals(30, Experience.xpForGame(3, 4));
    assertEquals(20, Experience.xpForGame(4, 4));
    assertEquals(20, Experience.xpForGame(9, 12));
    assertEquals(50, Experience.xpForGame(1, 2)); // empate: comparten la posición y el extra
  }

  @Test
  void soloGameGivesOnlyTheBase() {
    assertEquals(20, Experience.xpForGame(1, 1));
  }

  @Test
  void invalidPositionGivesOnlyTheBase() {
    assertEquals(20, Experience.xpForGame(0, 4));
    assertEquals(20, Experience.xpForGame(-1, 4));
  }

  @Test
  void levelThresholdsGrow() {
    assertEquals(0, Experience.levelStart(1));
    assertEquals(100, Experience.levelStart(2));
    assertEquals(250, Experience.levelStart(3));
    assertEquals(450, Experience.levelStart(4));
    assertEquals(2_700, Experience.levelStart(10));
    for (int level = 1; level < 500; level += 1) {
      long step = Experience.levelStart(level + 1) - Experience.levelStart(level);
      assertEquals(100 + 50L * (level - 1), step);
    }
  }

  @Test
  void levelForExactThresholds() {
    assertEquals(1, Experience.levelFor(0));
    assertEquals(1, Experience.levelFor(99));
    assertEquals(2, Experience.levelFor(100));
    assertEquals(2, Experience.levelFor(249));
    assertEquals(3, Experience.levelFor(250));
    assertEquals(1, Experience.levelFor(-5));
  }

  @Test
  void levelIsMonotonic() {
    int previous = 1;
    for (int xp = 0; xp <= 20_000; xp += 7) {
      int level = Experience.levelFor(xp);
      assertTrue(level >= previous);
      previous = level;
    }
  }

  @Test
  void progressCarriesBothThresholds() {
    assertEquals(new Experience.Progress(1, 0, 0, 100), Experience.progress(0));
    assertEquals(new Experience.Progress(2, 180, 100, 250), Experience.progress(180));
    assertEquals(new Experience.Progress(1, 0, 0, 100), Experience.progress(-10));
  }

  @Test
  void hugeXpDoesNotOverflow() {
    var progress = Experience.progress(Integer.MAX_VALUE);
    assertTrue(progress.levelXp() <= Integer.MAX_VALUE);
    assertTrue(progress.nextLevelXp() > progress.levelXp());
    assertTrue(Experience.levelStart(progress.level()) <= Integer.MAX_VALUE);
    assertEquals(Integer.MAX_VALUE, Experience.add(Integer.MAX_VALUE, 50));
    assertEquals(70, Experience.add(20, 50));
  }
}

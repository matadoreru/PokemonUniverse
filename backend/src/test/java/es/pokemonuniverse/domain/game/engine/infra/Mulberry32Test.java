package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import org.junit.jupiter.api.Test;

class Mulberry32Test {

  @Test
  void reproducesTheTypeScriptSequence() {
    var random = new Mulberry32(42);
    assertEquals(0.6011037519201636, random.getAsDouble());
    assertEquals(0.44829055899754167, random.getAsDouble());
    assertEquals(0.8524657934904099, random.getAsDouble());
  }

  @Test
  void differentSeedsDiffer() {
    assertNotEquals(new Mulberry32(1).getAsDouble(), new Mulberry32(2).getAsDouble());
  }
}

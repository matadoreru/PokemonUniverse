package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import org.junit.jupiter.api.Test;

class ImmutablesTest {

  @Test
  void appendedCopiesAndLeavesTheSourceUntouched() {
    var source = List.of("a", "b");
    assertEquals(List.of("a", "b", "c"), Immutables.appended(source, "c"));
    assertEquals(List.of("a", "b"), source);
  }
}

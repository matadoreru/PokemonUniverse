package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import java.util.List;
import org.junit.jupiter.api.Test;

class TimedLifecycleTest {

  @Test
  void roundBasedEpochMatchesJsonStringify() {
    var lifecycle = TimedLifecycle.of(GamePhase.ROUND_ACTIVE, 31_000L, null, 1000L, 1, null, null, null, null, null);
    assertEquals(new GameLifecycle(GamePhase.ROUND_ACTIVE, 31_000L, "[\"ROUND_ACTIVE\",1,1000,null,null,null,null,null]",
        List.of()), lifecycle);
  }

  @Test
  void turnBasedEpochMatchesJsonStringify() {
    var lifecycle = TimedLifecycle.of(GamePhase.TURN_ACTIVE, 9_000L, 4_000L, null, 2, 3, 0, null, null, "A", List.of("s1"));
    assertEquals("[\"TURN_ACTIVE\",2,null,3,0,null,null,\"A\"]", lifecycle.actionEpoch());
    assertEquals(4_000L, lifecycle.nextDeadline());
    assertEquals(List.of("s1"), lifecycle.spectatorIds());
  }

  @Test
  void noDeadlinesMeansNullAndStringsAreEscaped() {
    var lifecycle = TimedLifecycle.of(GamePhase.GAME_RESULTS, null, null, null, null, null, null, 4, 7, "a\"b");
    assertEquals(null, lifecycle.nextDeadline());
    assertEquals("[\"GAME_RESULTS\",null,null,null,null,4,7,\"a\\\"b\"]", lifecycle.actionEpoch());
  }
}

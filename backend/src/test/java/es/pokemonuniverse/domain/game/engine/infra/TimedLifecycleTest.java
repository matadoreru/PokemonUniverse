package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import java.util.List;
import org.junit.jupiter.api.Test;

class TimedLifecycleTest {

  @Test
  void roundBasedEpochMatchesJsonStringify() {
    var lifecycle = TimedLifecycle.builder(GamePhase.ROUND_ACTIVE).roundEndsAt(31_000L).roundStartedAt(1000L)
        .roundNumber(1).build();
    assertEquals(new GameLifecycle(GamePhase.ROUND_ACTIVE, 31_000L, "[\"ROUND_ACTIVE\",1,1000,null,null,null,null,null]",
        List.of()), lifecycle);
  }

  @Test
  void turnBasedEpochMatchesJsonStringify() {
    var lifecycle = TimedLifecycle.builder(GamePhase.TURN_ACTIVE).roundEndsAt(9_000L).nextTransitionAt(4_000L)
        .roundNumber(2).turnNumber(3).turnIndex(0).currentTeam("A").spectatorIds(List.of("s1")).build();
    assertEquals("[\"TURN_ACTIVE\",2,null,3,0,null,null,\"A\"]", lifecycle.actionEpoch());
    assertEquals(4_000L, lifecycle.nextDeadline());
    assertEquals(List.of("s1"), lifecycle.spectatorIds());
  }

  @Test
  void noDeadlinesMeansNullAndStringsAreEscaped() {
    var lifecycle = TimedLifecycle.builder(GamePhase.GAME_RESULTS).currentLotIndex(4).voteRoundNumber(7)
        .currentTeam("a\"b").spectatorIds(null).build();
    assertNull(lifecycle.nextDeadline());
    assertEquals("[\"GAME_RESULTS\",null,null,null,null,4,7,\"a\\\"b\"]", lifecycle.actionEpoch());
    assertEquals(List.of(), lifecycle.spectatorIds());
  }
}

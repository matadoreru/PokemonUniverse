package es.pokemonuniverse.domain.game.engine.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RunoffVotingTest {

  @Test
  void excludesDisconnectedVotersAndPlayersWithNoLegalCandidate() {
    var connected = Set.of("p1", "p2", "p3");
    assertEquals(List.of("p2", "p3"), RunoffVoting.eligibleRunoffVoterIds(List.of("p1", "p2", "p3", "p4"), List.of("p1"),
        connected::contains, (voter, candidate) -> !voter.equals(candidate)));
  }

  @Test
  void recordsImmutableRoundsAndNarrowsTiesWithoutCarryingPriorBallots() {
    var votes = new LinkedHashMap<String, String>();
    votes.put("p1", "p2");
    votes.put("p2", "p1");
    votes.put("p3", "p2");
    votes.put("p4", "p1");
    assertEquals(List.of("p1", "p2"), RunoffVoting.leadingRunoffCandidateIds(List.of("p1", "p2", "p3"), votes));
    var round = RunoffVoting.recordRunoffVoteRound(1, List.of("p1", "p2", "p3"), votes);
    assertEquals(new RunoffVoting.RunoffVoteRound(1, List.of("p1", "p2", "p3"), votes), round);
    votes.put("p5", "p3");
    assertEquals(4, round.votes().size());
    assertFalse(RunoffVoting.allEligibleRunoffVotersCompleted(List.of("p1", "p2"), Map.of()));
    assertFalse(RunoffVoting.allEligibleRunoffVotersCompleted(List.of("p1", "p2"), Map.of("p1", "p2", "p2", "")));
    assertTrue(RunoffVoting.allEligibleRunoffVotersCompleted(List.of("p1", "p2"), Map.of("p1", "p2", "p2", "p1")));
  }

  @Test
  void leadingCandidatesIgnoreUnknownVotesAndHandleEmptyInput() {
    assertEquals(List.of(), RunoffVoting.leadingRunoffCandidateIds(List.of(), Map.of("p1", "p2")));
    assertEquals(List.of("a", "b"), RunoffVoting.leadingRunoffCandidateIds(List.of("a", "b"), Map.of("p1", "zzz")));
  }
}

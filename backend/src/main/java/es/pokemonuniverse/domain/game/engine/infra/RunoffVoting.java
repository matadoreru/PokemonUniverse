package es.pokemonuniverse.domain.game.engine.infra;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiPredicate;
import java.util.function.Predicate;

/** Traducción literal del TS que antes estaba en {@code games/infrastructure/runoff-voting.ts}. */
public final class RunoffVoting {

  /** Ronda de desempate congelada: copias de candidatos y papeletas. */
  public record RunoffVoteRound(int number, List<String> candidateIds, Map<String, String> votes) {}

  private RunoffVoting() {}

  public static List<String> eligibleRunoffVoterIds(List<String> playerIds, List<String> candidateIds,
      Predicate<String> isRequired, BiPredicate<String, String> canVoteFor) {
    return playerIds.stream()
        .filter(playerId -> isRequired.test(playerId)
            && candidateIds.stream().anyMatch(candidateId -> canVoteFor.test(playerId, candidateId)))
        .toList();
  }

  /** {@code Boolean(votes[playerId])}: una papeleta vacía no cuenta. */
  public static boolean allEligibleRunoffVotersCompleted(List<String> eligiblePlayerIds, Map<String, String> votes) {
    for (var playerId : eligiblePlayerIds) {
      var vote = votes.get(playerId);
      if (vote == null || vote.isEmpty()) return false;
    }
    return true;
  }

  public static RunoffVoteRound recordRunoffVoteRound(int number, List<String> candidateIds, Map<String, String> votes) {
    return new RunoffVoteRound(number, List.copyOf(candidateIds), new LinkedHashMap<>(votes));
  }

  public static List<String> leadingRunoffCandidateIds(List<String> candidateIds, Map<String, String> votes) {
    if (candidateIds.isEmpty()) return List.of();
    var tallies = new LinkedHashMap<String, Integer>();
    for (var candidateId : candidateIds) tallies.put(candidateId, 0);
    for (var candidateId : votes.values()) {
      if (tallies.containsKey(candidateId)) tallies.put(candidateId, tallies.get(candidateId) + 1);
    }
    int maximum = tallies.values().stream().mapToInt(Integer::intValue).max().orElseThrow();
    return candidateIds.stream().filter(candidateId -> tallies.get(candidateId) == maximum).toList();
  }
}

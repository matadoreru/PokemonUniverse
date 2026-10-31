package es.pokemonuniverse.domain.room;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.serde.annotation.Serdeable;
import java.util.HashSet;
import java.util.List;

/** Traducción literal de {@code rooms/game-skip.ts}. */
public final class GameSkip {

  /** {@code GameSkipStateView}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record StateView(String gameInstanceId, List<String> voterIds, int votes, int requiredVotes,
      boolean currentUserVoted, boolean canVote) {}

  private GameSkip() {}

  public static List<String> eligibleVoterIds(LiveRoom room) {
    var game = room.game;
    if (game == null || game.finishReason != null) return List.of();
    return game.participantIds.stream().filter(playerId -> {
      var member = room.members.get(playerId);
      return member != null && member.presence != PresenceStatus.LEFT && !game.departedParticipantIds.contains(playerId);
    }).toList();
  }

  public static List<String> reconcileVotes(LiveRoom room) {
    var game = room.game;
    var eligibleIds = eligibleVoterIds(room);
    if (game == null) return eligibleIds;
    var eligible = new HashSet<>(eligibleIds);
    game.skipVoterIds.removeIf(playerId -> !eligible.contains(playerId));
    return eligibleIds;
  }

  public static boolean hasUnanimousSkip(LiveRoom room) {
    return hasUnanimousSkip(room, reconcileVotes(room));
  }

  public static boolean hasUnanimousSkip(LiveRoom room, List<String> eligibleIds) {
    var votes = room.game == null ? null : room.game.skipVoterIds;
    return votes != null && !eligibleIds.isEmpty() && votes.containsAll(eligibleIds);
  }

  /** {@code gameSkipStateView}; {@code null} sin partida activa o en {@code GAME_RESULTS}. */
  public static @io.micronaut.core.annotation.Nullable StateView stateView(LiveRoom room, String playerId) {
    var game = room.game;
    if (game == null || game.finishReason != null || room.phase == RoomPhase.GAME_RESULTS) return null;
    var eligibleIds = eligibleVoterIds(room);
    var voterIds = eligibleIds.stream().filter(game.skipVoterIds::contains).toList();
    var member = room.members.get(playerId);
    return new StateView(game.resultId, voterIds, voterIds.size(), eligibleIds.size(),
        game.skipVoterIds.contains(playerId),
        member != null && member.presence == PresenceStatus.CONNECTED && eligibleIds.contains(playerId));
  }
}

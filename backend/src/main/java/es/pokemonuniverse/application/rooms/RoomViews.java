package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.progression.Experience;
import es.pokemonuniverse.domain.room.GameSkip;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.PresenceStatus;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * {@code publicView}/{@code view}/{@code broadcast} de {@code manager.ts}. Se usa siempre con el lock de la sala tomado.
 * {@code broadcast} calcula la proyección pública una vez y la privada por miembro con conexión.
 */
final class RoomViews {

  private final GameRegistry registry;
  private final Map<String, JsonNode> defaultConfigs;
  private final Clock clock;
  private final RoomEvents events;
  private final Function<Object, JsonNode> toTree;

  RoomViews(GameRegistry registry, Map<String, JsonNode> defaultConfigs, Clock clock, RoomEvents events,
      Function<Object, JsonNode> toTree) {
    this.registry = registry;
    this.defaultConfigs = defaultConfigs;
    this.clock = clock;
    this.events = events;
    this.toTree = toTree;
  }

  RoomView publicView(LiveRoom room, GameContext context, int hostCustomCategoryCount,
      int hostWouldYouRatherPromptCount) {
    var connectedVoterIds = room.members.values().stream()
        .filter(member -> member.presence == PresenceStatus.CONNECTED).map(member -> member.identity.id()).toList();
    var acceptedVoterIds = room.nextGameVote == null ? List.<String>of() : List.copyOf(room.nextGameVote.votes.keySet());
    var eligibleVoterIds = new LinkedHashSet<String>(connectedVoterIds);
    eligibleVoterIds.addAll(acceptedVoterIds);
    var vote = room.nextGameVote;
    var nextGameVote = vote == null ? null : new RoomView.NextGameVoteView(
        vote.optionGameIds.stream().map(gameId -> ManifestView.of(registry.get(gameId).orElseThrow())).toList(),
        List.copyOf(eligibleVoterIds), acceptedVoterIds, null, vote.endsAt, vote.resolvedGameId,
        vote.tallies == null ? null : new LinkedHashMap<>(vote.tallies), vote.nextTransitionAt);
    var game = room.game;
    return RoomView.builder()
        .roomInstanceId(room.historyId)
        .revision(room.revision)
        .gameCatalogVersion(game != null ? game.catalog.version() : null)
        .code(room.code)
        .phase(room.phase)
        .hostId(room.hostId)
        .maxPlayers(room.maxPlayers)
        .members(room.members.values().stream().map(member -> new RoomView.MemberView(member.identity.id(),
            member.identity.displayName(), member.identity.avatar(), member.connected, member.presence,
            member.roomRole, member.role, member.identity.id().equals(room.hostId), member.ready,
            member.sessionPoints, member.xp == null ? null : Experience.levelFor(member.xp))).toList())
        .availableGames(registry.manifests().stream().map(ManifestView::of).toList())
        .selectedGameId(room.selectedGameId)
        .selectedGameConfig(room.gameConfigs.get(room.selectedGameId))
        .sessionMode(room.sessionMode)
        .gameConfigs(new LinkedHashMap<>(room.gameConfigs))
        .customizedGameIds(registry.list().stream().map(GameManifest::id)
            .filter(id -> !configEquals(room.gameConfigs.get(id), defaultConfigs.get(id))).toList())
        .gameSelectionMode(room.gameSelectionMode)
        .nextGameVote(nextGameVote)
        .gameSkipState(null)
        .gameIntro(room.intro == null ? null : new RoomView.GameIntroView(room.intro.gameInstanceId,
            room.intro.endsAt, List.copyOf(room.intro.skippedIds)))
        .gamesPlayed(room.gamesPlayed)
        .sessionStandings(room.sessionParticipants.values().stream().map(participant ->
            new RoomView.SessionStandingView(participant.identity.id(), participant.identity.displayName(),
                participant.identity.avatar(), participant.sessionPoints)).toList())
        .sessionHistory(List.copyOf(room.sessionHistory))
        .gameActionEpoch(game != null ? game.engine.getLifecycle(game.state).actionEpoch() : null)
        .game(game != null ? toTree.apply(game.engine.getPublicState(game.state, context)) : null)
        .gamePlayerState(null)
        .serverNow(clock.now())
        .hostCustomCategoryCount(hostCustomCategoryCount)
        .hostWouldYouRatherPromptCount(hostWouldYouRatherPromptCount)
        .build();
  }

  /** {@code isDeepStrictEqual}; ausente en un lado solo es igual si falta en ambos. */
  static boolean configEquals(@Nullable JsonNode left, @Nullable JsonNode right) {
    if (left == null || right == null) return left == right;
    return JsonTree.equal(left, right);
  }

  RoomView view(LiveRoom room, String playerId, RoomView shared, GameContext context) {
    var vote = room.nextGameVote;
    return shared.forMember(GameSkip.stateView(room, playerId),
        shared.nextGameVote() == null ? null
            : shared.nextGameVote().withOwnVote(vote == null ? null : vote.votes.get(playerId)),
        room.game != null ? toTree.apply(room.game.engine.getPlayerState(room.game.state, playerId, context)) : null);
  }

  /** Revisión y {@code updatedAt} ya actualizados por el coordinador. */
  void broadcast(LiveRoom room, GameContext context, int hostCustomCategoryCount, int hostWouldYouRatherPromptCount) {
    var shared = publicView(room, context, hostCustomCategoryCount, hostWouldYouRatherPromptCount);
    for (var member : room.members.values()) {
      if (member.connectionId != null) {
        events.sendToMember(member.identity.id(), member.connectionId, "room:state",
            view(room, member.identity.id(), shared, context));
      }
    }
  }
}

package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.json.JsonTree;
import es.pokemonuniverse.domain.progression.Experience;
import es.pokemonuniverse.domain.room.GameModes;
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
        vote.options.stream().map(option -> new RoomView.NextGameVoteOptionView(option.id(),
            ManifestView.of(registry.get(option.gameId()).orElseThrow()), option.mode())).toList(),
        List.copyOf(eligibleVoterIds), acceptedVoterIds, null, vote.endsAt, vote.resolvedOptionId,
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
            member.sessionPoints, member.xp == null ? null : Experience.levelFor(member.xp),
            room.chat.isMuted(member.identity.id()))).toList())
        .availableGames(registry.manifests().stream().map(ManifestView::of).toList())
        .selectedGameId(room.selectedGameId)
        // En partida, la configuración con la que arrancó (con el modo sorteado o votado); en el lobby, la elegida.
        .selectedGameConfig(game != null && game.gameId.equals(room.selectedGameId) ? game.configTree
            : room.gameConfigs.get(room.selectedGameId))
        .sessionMode(room.sessionMode)
        .gameConfigs(new LinkedHashMap<>(room.gameConfigs))
        .customizedGameIds(registry.list().stream().map(GameManifest::id)
            .filter(id -> !configEquals(room.gameConfigs.get(id), defaultConfigs.get(id))).toList())
        .gameSelectionMode(room.gameSelectionMode)
        .allowedModes(allowedModes(room))
        .nextGameVote(nextGameVote)
        .gameSkipState(null)
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

  /** Los modos que pueden salir de cada juego con modos registrado (los elegidos o el de su configuración). */
  private Map<String, List<String>> allowedModes(LiveRoom room) {
    var allowed = new LinkedHashMap<String, List<String>>();
    for (var manifest : registry.list()) {
      var gameId = manifest.id();
      if (GameModes.hasModes(gameId)) {
        allowed.put(gameId, GameModes.allowed(room.allowedModes, gameId, room.gameConfigs.get(gameId)));
      }
    }
    return allowed;
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

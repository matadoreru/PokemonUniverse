package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.room.GamePick;
import es.pokemonuniverse.domain.room.GameSelectionMode;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.NextGameVote;
import es.pokemonuniverse.domain.room.PresenceStatus;
import es.pokemonuniverse.domain.room.RoomPhase;
import io.micronaut.core.annotation.Nullable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;

/**
 * Votación del siguiente juego en una sesión por votación: la abre, recoge los votos y la resuelve. Se usa siempre con
 * el lock de la sala tomado; el desempate al azar usa {@link GameRotation#randomItem}, el azar de la sala. Sus plazos van
 * en la hora de la sala ({@link LiveRoom#now}), la misma del {@code serverNow} con que la web los cuenta.
 */
final class NextGameVoting {

  static final long NEXT_GAME_VOTE_MS = 15_000;
  /** {@code NEXT_GAME_VOTE_OPTIONS} de {@code room.ts}: opciones como máximo de la votación del siguiente juego. */
  static final int NEXT_GAME_VOTE_OPTIONS = 3;
  static final long NEXT_GAME_VOTE_RESULT_MS = 3_000;

  private final GameRegistry registry;
  private final GameRotation rotation;
  private final Clock clock;
  private final Consumer<LiveRoom> backToLobby;
  private final Consumer<LiveRoom> publish;

  /**
   * {@code backToLobby}: vuelta al lobby sin cerrar la sesión (ninguna opción es ya jugable); {@code publish}: difunde
   * la sala y reprograma su temporizador.
   */
  NextGameVoting(GameRegistry registry, GameRotation rotation, Clock clock, Consumer<LiveRoom> backToLobby,
      Consumer<LiveRoom> publish) {
    this.registry = registry;
    this.rotation = rotation;
    this.clock = clock;
    this.backToLobby = backToLobby;
    this.publish = publish;
  }

  private List<String> eligibleVoterIds(LiveRoom room) {
    return room.members.values().stream().filter(member -> member.presence == PresenceStatus.CONNECTED)
        .map(member -> member.identity.id()).toList();
  }

  /**
   * Votación entre hasta {@code NEXT_GAME_VOTE_OPTIONS} pares de {@code candidates} (cada modo permitido de un juego
   * es una opción); con menos de dos no hay votación.
   */
  boolean begin(LiveRoom room, List<GamePick> candidates) {
    if (!(room.gameSelectionMode instanceof GameSelectionMode.Vote)) return false;
    var options = rotation.shuffled(candidates);
    var picks = options.subList(0, Math.min(NEXT_GAME_VOTE_OPTIONS, options.size()));
    if (picks.size() < 2) return false;
    room.nextGameVote = new NextGameVote(picks, room.now(clock.now()) + NEXT_GAME_VOTE_MS);
    room.phase = RoomPhase.NEXT_GAME_VOTE;
    return true;
  }

  void resolve(LiveRoom room) {
    var vote = room.nextGameVote;
    if (vote == null || room.phase != RoomPhase.NEXT_GAME_VOTE) return;
    var tallies = new LinkedHashMap<String, Integer>();
    for (var optionId : vote.optionIds) tallies.put(optionId, 0);
    for (var optionId : vote.votes.values()) tallies.merge(optionId, 1, Integer::sum);
    int playerCount = rotation.connectedPlayerCount(room);
    var playable = vote.options.stream().filter(option -> rotation.playable(room, option.pick(), playerCount)).toList();
    if (playable.isEmpty()) {
      backToLobby.accept(room);
      return;
    }
    int maximum = playable.stream().mapToInt(option -> tallies.getOrDefault(option.id(), 0)).max().orElse(0);
    var tied = playable.stream().filter(option -> Objects.equals(tallies.get(option.id()), maximum)).toList();
    var resolved = rotation.randomItem(tied);
    vote.endsAt = null;
    vote.resolvedOptionId = resolved.id();
    vote.tallies = tallies;
    vote.nextTransitionAt = room.now(clock.now()) + NEXT_GAME_VOTE_RESULT_MS;
    // El modo votado sobrevive a la vuelta al lobby de tick(): launchGame lo consume al arrancar.
    room.selectedGameId = resolved.gameId();
    room.selectedMode = resolved.mode();
    room.phase = RoomPhase.NEXT_GAME_VOTE_RESULTS;
  }

  /** Con la votación abierta: se resuelve en cuanto han votado todos los conectados. */
  void resolveIfEveryoneVoted(LiveRoom room) {
    var eligibleIds = eligibleVoterIds(room);
    if (room.nextGameVote.votes.keySet().containsAll(eligibleIds)) resolve(room);
  }

  /** {@code optionId}: el id de la opción (el del juego si sale con un solo modo, {@code juego:MODO} si no). */
  void vote(LiveRoom room, String playerId, @Nullable String optionId) {
    var vote = room.nextGameVote;
    if (vote == null || room.phase != RoomPhase.NEXT_GAME_VOTE) {
      throw new RoomException("No hay una votación de minijuegos activa.");
    }
    var member = room.members.get(playerId);
    if (member == null || member.presence != PresenceStatus.CONNECTED) {
      throw new RoomException("No puedes votar en este momento.");
    }
    if (vote.endsAt != null && room.now(clock.now()) >= vote.endsAt) {
      resolve(room);
      publish.accept(room);
      throw new RoomException("La votación ha terminado.");
    }
    var option = vote.option(optionId);
    if (option == null) throw new RoomException("Ese minijuego no es una opción válida.");
    var manifest = registry.get(option.gameId()).orElse(null);
    if (manifest == null || !ManifestView.supportsPlayerCount(manifest, rotation.connectedPlayerCount(room))) {
      throw new RoomException("Ese minijuego ya no admite el número actual de jugadores.");
    }
    if (vote.votes.containsKey(playerId)) throw new RoomException("Tu voto ya está bloqueado.");
    vote.votes.put(playerId, option.id());
    resolveIfEveryoneVoted(room);
    publish.accept(room);
  }
}

package es.pokemonuniverse.domain.room;

import es.pokemonuniverse.domain.identity.AuthUser;
import java.util.Comparator;
import java.util.Optional;

/** Traducción literal de {@code rooms/presence.ts}. */
public final class Presence {

  private Presence() {}

  public static void restoreMember(RoomMember member, AuthUser identity, String connectionId) {
    RoomTimer.cancel(member.disconnectTimer);
    member.identity = identity;
    member.disconnectTimer = null;
    member.presenceGraceTimer = RoomTimer.cancel(member.presenceGraceTimer);
    member.connected = true;
    member.presence = PresenceStatus.CONNECTED;
    member.connectionId = connectionId;
  }

  public static void markTemporarilyDisconnected(RoomMember member) {
    member.connected = false;
    member.presence = PresenceStatus.TEMPORARILY_DISCONNECTED;
    member.connectionId = null;
  }

  public static void markLeft(RoomMember member) {
    RoomTimer.cancel(member.disconnectTimer);
    member.disconnectTimer = null;
    member.presenceGraceTimer = RoomTimer.cancel(member.presenceGraceTimer);
    member.connected = false;
    member.presence = PresenceStatus.LEFT;
    member.connectionId = null;
  }

  /** El conectado más antiguo; {@code sort} es estable, así que en empate gana el primero insertado. */
  public static Optional<RoomMember> oldestConnectedMember(LiveRoom room) {
    return room.members.values().stream()
        .filter(member -> member.presence == PresenceStatus.CONNECTED)
        .min(Comparator.comparingLong(member -> member.joinedAt));
  }

  public static boolean gameRetainsPlayer(LiveRoom room, String playerId) {
    var game = room.game;
    if (game == null || game.finishReason != null || room.phase == RoomPhase.GAME_RESULTS
        || room.phase == RoomPhase.SESSION_RESULTS) {
      return false;
    }
    return game.participantIds.contains(playerId);
  }
}

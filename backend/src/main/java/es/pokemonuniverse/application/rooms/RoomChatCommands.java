package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.room.ChatFilter;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.PresenceStatus;
import es.pokemonuniverse.domain.room.RoomChat;
import es.pokemonuniverse.domain.room.RoomPhase;
import es.pokemonuniverse.domain.room.RoomRole;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.function.Supplier;

/**
 * Comandos del chat del lobby y sus envíos. Se usa siempre con el lock de la sala tomado; el coordinador comprueba
 * antes la sala del reto y los permisos, en el orden de sus mensajes de error.
 */
final class RoomChatCommands {

  private static final String CHAT_ONLY_LOBBY = "Chat is only available in the lobby";
  private static final String NO_PERMISSION = "No tienes permiso para realizar esta acción.";

  private final RoomEvents events;
  private final Clock clock;
  private final ChatFilter filter;

  RoomChatCommands(RoomEvents events, Clock clock, ChatFilter filter) {
    this.events = events;
    this.clock = clock;
    this.filter = filter;
  }

  static void assertLobby(LiveRoom room) {
    if (room.phase != RoomPhase.LOBBY) throw new RoomException(CHAT_ONLY_LOBBY);
  }

  /** {@code room:chat:send}; un {@code text} que no sea cadena cuenta como ausente. */
  void send(LiveRoom room, String playerId, @Nullable JsonNode text) {
    assertLobby(room);
    var member = room.members.get(playerId);
    if (member == null) throw new RoomException("Not in a room");
    var raw = text != null && text.isString() ? text.getStringValue() : null;
    var message = rejections(() -> room.chat.post(playerId, member.identity.displayName(), raw,
        room.hostId.equals(playerId), clock.now(), filter));
    sendToMembers(room, "room:chat:message", new ChatEvents.Message(room.historyId, message));
  }

  /** {@code room:chat:delete}, ya con el permiso de moderar comprobado: un Co-host no borra mensajes del Host. */
  void delete(LiveRoom room, String actorId, @Nullable JsonNode seq) {
    var id = seq(seq);
    var message = room.chat.find(id);
    if (message == null) throw new RoomException(RoomChat.NOT_FOUND);
    if (message.authorId().equals(room.hostId) && !actorId.equals(room.hostId)) {
      throw new RoomException(NO_PERMISSION);
    }
    rejections(() -> {
      room.chat.delete(id);
      return null;
    });
    sendToMembers(room, "room:chat:deleted", new ChatEvents.Deleted(room.historyId, id));
  }

  /**
   * {@code room:chat:mute}, ya con el permiso de moderar comprobado: el silencio dura la sala; solo el Host silencia a
   * un Co-host y nadie al Host. El coordinador difunde la sala después.
   */
  void setMute(LiveRoom room, String actorId, @Nullable String playerId, @Nullable JsonNode muted) {
    if (muted == null || !muted.isBoolean()) throw new RoomException("Invalid chat command");
    if (actorId.equals(playerId)) throw new RoomException(RoomChat.CANNOT_MUTE_SELF);
    var target = playerId == null ? null : room.members.get(playerId);
    if (target == null) throw new RoomException("Player not found");
    if (room.hostId.equals(playerId)
        || (target.roomRole == RoomRole.CO_HOST && !actorId.equals(room.hostId))) {
      throw new RoomException(NO_PERMISSION);
    }
    room.chat.setMuted(playerId, muted.getBooleanValue());
  }

  void sendHistory(LiveRoom room, String playerId, String connectionId) {
    events.sendToMember(playerId, connectionId, "room:chat:history",
        new ChatEvents.History(room.historyId, room.chat.history()));
  }

  /** Un número entero; cualquier otra cosa no es un mensaje que exista. */
  private static long seq(@Nullable JsonNode seq) {
    if (seq == null || !seq.isNumber()) throw new RoomException(RoomChat.NOT_FOUND);
    double value = seq.getDoubleValue();
    if (!Double.isFinite(value) || value != Math.rint(value) || Math.abs(value) > 9_007_199_254_740_991d) {
      throw new RoomException(RoomChat.NOT_FOUND);
    }
    return (long) value;
  }

  private static <T> T rejections(Supplier<T> operation) {
    try {
      return operation.get();
    } catch (RoomChat.Rejected e) {
      throw new RoomException(e.getMessage());
    }
  }

  private void sendToMembers(LiveRoom room, String event, Object payload) {
    for (var member : room.members.values()) {
      if (member.connectionId != null && member.presence != PresenceStatus.LEFT) {
        events.sendToMember(member.identity.id(), member.connectionId, event, payload);
      }
    }
  }
}

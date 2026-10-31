package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.MemberRole;
import es.pokemonuniverse.domain.room.PresenceStatus;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * {@code rooms/cursor-channel.ts}: transporte efímero de cursores, autorizado solo por la proyección de canal del
 * motor. Se usa siempre con el lock de la sala tomado.
 */
final class CursorRelay {

  static final String CURSOR = "who-is-who:cursor";
  static final String CURSOR_CLEAR = "who-is-who:cursor-clear";
  static final String CURSORS_RESET = "who-is-who:cursors-reset";

  private record Rate(long startedAt, int count) {}

  private final Map<String, Rate> rates = new ConcurrentHashMap<>();
  private final RoomEvents events;
  private final Clock clock;

  CursorRelay(RoomEvents events, Clock clock) {
    this.events = events;
    this.clock = clock;
  }

  void update(LiveRoom room, String playerId, JsonNode payload) {
    var member = room.members.get(playerId);
    var game = room.game;
    var channel = game == null ? null : game.engine.getCursorChannel(game.state, playerId).orElse(null);
    if (channel == null || member == null || member.presence != PresenceStatus.CONNECTED
        || member.role != MemberRole.PLAYER) {
      throw new RoomException("No puedes compartir cursor en este momento.");
    }
    var position = parsePosition(payload);
    var pokemonId = position.get("pokemonId");
    if (pokemonId != null && !channel.targetIds().contains((String) pokemonId)) {
      throw new RoomException("Ese Pokémon no está en el tablero.");
    }
    long now = clock.now();
    var key = room.code + ":" + playerId;
    var rate = rates.get(key);
    if (rate == null || now - rate.startedAt() >= 1_000) {
      rates.put(key, new Rate(now, 1));
    } else {
      if (rate.count() >= 30) throw new RoomException("Demasiadas actualizaciones de cursor.");
      rates.put(key, new Rate(rate.startedAt(), rate.count() + 1));
    }
    var cursor = new LinkedHashMap<String, Object>();
    cursor.put("playerId", playerId);
    cursor.putAll(position);
    cursor.put("updatedAt", now);
    for (var id : channel.playerIds()) {
      var target = room.members.get(id);
      if (!id.equals(playerId) && target != null && target.presence == PresenceStatus.CONNECTED
          && target.connectionId != null) {
        events.sendToMember(id, target.connectionId, CURSOR, cursor);
      }
    }
  }

  void clear(LiveRoom room, String playerId) {
    rates.remove(room.code + ":" + playerId);
    var game = room.game;
    var channel = game == null ? null : game.engine.getCursorChannel(game.state, playerId).orElse(null);
    if (channel == null) return;
    for (var id : channel.playerIds()) {
      var target = room.members.get(id);
      if (!id.equals(playerId) && target != null && target.connectionId != null) {
        events.sendToMember(id, target.connectionId, CURSOR_CLEAR, Map.of("playerId", playerId));
      }
    }
  }

  void reset(LiveRoom room) {
    rates.keySet().removeIf(key -> key.startsWith(room.code + ":"));
    for (var member : room.members.values()) {
      if (member.connectionId != null) {
        events.sendToMember(member.identity.id(), member.connectionId, CURSORS_RESET, null);
      }
    }
  }

  /** {@code whoIsWhoCursorPositionSchema} (estricto, con anclaje de carta completo o ausente). */
  static Map<String, Object> parsePosition(JsonNode raw) {
    var issues = new ZodIssues();
    if (raw == null || !raw.isObject()) {
      issues.rootNotObject(raw);
      throw issues.toException();
    }
    var position = new LinkedHashMap<String, Object>();
    unit(raw, "x", true, position, issues);
    unit(raw, "y", true, position, issues);
    var pokemonId = raw.get("pokemonId");
    if (pokemonId != null) {
      if (!pokemonId.isString()) {
        issues.invalidType("string", pokemonId, List.of("pokemonId"));
      } else if (pokemonId.getStringValue().isEmpty()) {
        issues.tooSmall("string", 1, List.of("pokemonId"), "Too small: expected string to have >=1 characters");
      } else if (pokemonId.getStringValue().length() > 96) {
        issues.tooBig("string", 96, List.of("pokemonId"), "Too big: expected string to have <=96 characters");
      } else {
        position.put("pokemonId", pokemonId.getStringValue());
      }
    }
    unit(raw, "cardX", false, position, issues);
    unit(raw, "cardY", false, position, issues);
    var unknown = new ArrayList<String>();
    var allowed = Set.of("x", "y", "pokemonId", "cardX", "cardY");
    for (var entry : raw.entries()) if (!allowed.contains(entry.getKey())) unknown.add(entry.getKey());
    if (!unknown.isEmpty()) issues.unrecognizedKeys(unknown);
    if (issues.isEmpty()) {
      long anchors = List.of("pokemonId", "cardX", "cardY").stream().filter(position::containsKey).count();
      if (anchors != 0 && anchors != 3) issues.custom(List.of(), "El anclaje de carta está incompleto.");
    }
    if (!issues.isEmpty()) throw issues.toException();
    return position;
  }

  private static void unit(JsonNode raw, String key, boolean required, Map<String, Object> out, ZodIssues issues) {
    var node = raw.get(key);
    if (node == null && !required) return;
    if (node == null || !node.isNumber()) {
      issues.invalidType("number", node, List.of(key));
      return;
    }
    double value = node.getDoubleValue();
    if (value < 0) {
      issues.tooSmall("number", 0, List.of(key), "Too small: expected number to be >=0");
    } else if (value > 1) {
      issues.tooBig("number", 1, List.of(key), "Too big: expected number to be <=1");
    } else {
      out.put(key, value);
    }
  }
}

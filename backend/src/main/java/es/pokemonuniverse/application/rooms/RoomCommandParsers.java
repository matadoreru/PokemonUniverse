package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.room.GameSelectionMode;
import es.pokemonuniverse.domain.room.RoomRole;
import es.pokemonuniverse.domain.room.SessionMode;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Esquemas Zod de {@code room.ts} que usa {@code manager.ts}. Un fallo lanza {@link RoomException} con el mensaje de
 * Zod ({@link ZodIssues}). Los objetos no estrictos descartan claves desconocidas como {@code z.object}.
 */
public final class RoomCommandParsers {

  static final Pattern ROOM_CODE = Pattern.compile("^[A-Z2-9]{6}$");
  /** Expresión de {@code z.string().uuid()} en Zod 4. */
  static final String UUID_PATTERN = "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-"
      + "[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$";
  private static final Pattern UUID = Pattern.compile(UUID_PATTERN);
  private static final List<String> SESSION_TYPES = List.of("INFINITE", "GAME_COUNT", "POINT_TARGET");
  private static final List<String> SELECTION_TYPES = List.of("FIXED", "RANDOM", "VOTE");
  private static final List<String> ASSIGNABLE_ROLES = List.of("CO_HOST", "MEMBER");

  /** {@code { gameInstanceId, wantsToSkip }} validado. */
  public record SetGameSkipVoteRequest(String gameInstanceId, boolean wantsToSkip) {}

  /** {@code { gameInstanceId, actionEpoch, action }} validado; {@code action} sigue siendo JSON crudo. */
  public record GameActionRequest(String gameInstanceId, String actionEpoch, JsonNode action) {}

  private RoomCommandParsers() {}

  /** {@code roomCodeSchema}: {@code trim()}, {@code toUpperCase()} y {@code ^[A-Z2-9]{6}$}. */
  public static String roomCode(@Nullable JsonNode raw) {
    var issues = new ZodIssues();
    if (raw == null || !raw.isString()) {
      issues.invalidType("string", raw, List.of());
      throw issues.toException();
    }
    var code = raw.getStringValue().strip().toUpperCase(Locale.ROOT);
    if (!ROOM_CODE.matcher(code).matches()) {
      issues.invalidFormat("regex", "/^[A-Z2-9]{6}$/", List.of(), "Invalid string: must match pattern /^[A-Z2-9]{6}$/");
      throw issues.toException();
    }
    return code;
  }

  /** {@code sessionModeSchema}. */
  public static SessionMode sessionMode(@Nullable JsonNode raw) {
    var issues = new ZodIssues();
    var type = discriminator(raw, SESSION_TYPES, issues);
    return switch (type) {
      case "INFINITE" -> new SessionMode.Infinite();
      case "GAME_COUNT" -> new SessionMode.GameCount(integer(raw, "target", 1, 100, issues));
      default -> new SessionMode.PointTarget(integer(raw, "target", 5, 10_000, issues));
    };
  }

  /** {@code gameSelectionModeSchema}. */
  public static GameSelectionMode gameSelectionMode(@Nullable JsonNode raw) {
    var issues = new ZodIssues();
    var type = discriminator(raw, SELECTION_TYPES, issues);
    return switch (type) {
      case "FIXED" -> new GameSelectionMode.Fixed();
      case "RANDOM" -> new GameSelectionMode.Random(gameIds(raw, 2, "Selecciona al menos 2 minijuegos.", issues));
      default -> new GameSelectionMode.Vote(gameIds(raw, 3, "Selecciona al menos 3 minijuegos.", issues));
    };
  }

  /** {@code assignableRoomRoleSchema}. */
  public static RoomRole assignableRole(@Nullable JsonNode raw) {
    if (raw != null && raw.isString() && ASSIGNABLE_ROLES.contains(raw.getStringValue())) {
      return RoomRole.valueOf(raw.getStringValue());
    }
    var issues = new ZodIssues();
    issues.invalidValue(ASSIGNABLE_ROLES);
    throw issues.toException();
  }

  /** {@code setGameSkipVoteRequestSchema} (estricto). */
  public static SetGameSkipVoteRequest setGameSkipVoteRequest(@Nullable JsonNode raw) {
    var issues = new ZodIssues();
    if (raw == null || !raw.isObject()) {
      issues.rootNotObject(raw);
      throw issues.toException();
    }
    var id = uuid(raw.get("gameInstanceId"), "gameInstanceId", issues);
    var wants = raw.get("wantsToSkip");
    if (wants == null || !wants.isBoolean()) issues.invalidType("boolean", wants, List.of("wantsToSkip"));
    strict(raw, Set.of("gameInstanceId", "wantsToSkip"), issues);
    if (!issues.isEmpty()) throw issues.toException();
    return new SetGameSkipVoteRequest(id, wants.getBooleanValue());
  }

  /** {@code gameActionRequestSchema} (estricto; {@code action} obligatoria, aunque sea {@code null}). */
  public static GameActionRequest gameActionRequest(@Nullable JsonNode raw) {
    var issues = new ZodIssues();
    if (raw == null || !raw.isObject()) {
      issues.rootNotObject(raw);
      throw issues.toException();
    }
    var id = uuid(raw.get("gameInstanceId"), "gameInstanceId", issues);
    var epoch = raw.get("actionEpoch");
    if (epoch == null || !epoch.isString()) {
      issues.invalidType("string", epoch, List.of("actionEpoch"));
    } else if (epoch.getStringValue().isEmpty()) {
      issues.tooSmall("string", 1, List.of("actionEpoch"), "Too small: expected string to have >=1 characters");
    } else if (epoch.getStringValue().length() > 512) {
      issues.tooBig("string", 512, List.of("actionEpoch"), "Too big: expected string to have <=512 characters");
    }
    var action = raw.get("action");
    if (action == null) {
      issues.invalidType("nonoptional", null, List.of("action"));
    }
    strict(raw, Set.of("gameInstanceId", "actionEpoch", "action"), issues);
    if (!issues.isEmpty()) throw issues.toException();
    return new GameActionRequest(id, epoch.getStringValue(), action);
  }

  private static String discriminator(@Nullable JsonNode raw, List<String> options, ZodIssues issues) {
    if (raw == null || !raw.isObject()) {
      issues.rootNotObject(raw);
      throw issues.toException();
    }
    var type = raw.get("type");
    if (type == null || !type.isString() || !options.contains(type.getStringValue())) {
      issues.noDiscriminator(options);
      throw issues.toException();
    }
    return type.getStringValue();
  }

  private static int integer(JsonNode raw, String key, int min, int max, ZodIssues issues) {
    var node = raw.get(key);
    var path = List.<Object>of(key);
    if (node == null || !node.isNumber()) {
      issues.invalidType("number", node, path);
      throw issues.toException();
    }
    double value = node.getDoubleValue();
    if (value != Math.rint(value) || Math.abs(value) > 9_007_199_254_740_991d) {
      issues.notInteger(path);
      throw issues.toException();
    }
    if (value < min) issues.tooSmall("number", min, path, "Too small: expected number to be >=" + min);
    if (value > max) issues.tooBig("number", max, path, "Too big: expected number to be <=" + max);
    if (!issues.isEmpty()) throw issues.toException();
    return (int) value;
  }

  private static List<String> gameIds(JsonNode raw, int minimum, String minimumMessage, ZodIssues issues) {
    var node = raw.get("gameIds");
    var path = List.<Object>of("gameIds");
    if (node == null || !node.isArray()) {
      issues.invalidType("array", node, path);
      throw issues.toException();
    }
    var ids = new ArrayList<String>();
    for (int i = 0; i < node.size(); i++) {
      var item = node.get(i);
      var itemPath = List.<Object>of("gameIds", i);
      if (item == null || !item.isString()) {
        issues.invalidType("string", item, itemPath);
      } else if (item.getStringValue().isEmpty()) {
        issues.tooSmall("string", 1, itemPath, "Too small: expected string to have >=1 characters");
      } else {
        ids.add(item.getStringValue());
      }
    }
    if (node.size() < minimum) issues.tooSmall("array", minimum, path, minimumMessage);
    if (issues.isEmpty() && new HashSet<>(ids).size() != ids.size()) {
      issues.custom(path, "Los minijuegos no pueden repetirse.");
    }
    if (!issues.isEmpty()) throw issues.toException();
    return ids;
  }

  private static String uuid(@Nullable JsonNode node, String key, ZodIssues issues) {
    if (node == null || !node.isString()) {
      issues.invalidType("string", node, List.of(key));
      return null;
    }
    if (!UUID.matcher(node.getStringValue()).matches()) {
      issues.invalidFormat("uuid", "/" + UUID_PATTERN + "/", List.of(key), "Invalid UUID");
      return null;
    }
    return node.getStringValue();
  }

  private static void strict(JsonNode raw, Set<String> allowed, ZodIssues issues) {
    var unknown = new ArrayList<String>();
    for (var entry : raw.entries()) if (!allowed.contains(entry.getKey())) unknown.add(entry.getKey());
    if (!unknown.isEmpty()) issues.unrecognizedKeys(unknown);
  }
}

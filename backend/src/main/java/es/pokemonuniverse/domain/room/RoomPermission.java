package es.pokemonuniverse.domain.room;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/** {@code ROOM_PERMISSIONS} y la tabla {@code ROOM_ROLE_PERMISSIONS} de {@code room.ts}. */
public enum RoomPermission {
  CHANGE_GAME,
  EDIT_GAME_CONFIG,
  EDIT_SESSION,
  EDIT_GAME_SELECTION,
  START_GAME,
  END_SESSION,
  MANAGE_ROLES,
  KICK_MEMBER,
  TRANSFER_HOST;

  private static final Map<RoomRole, Set<RoomPermission>> ROLE_PERMISSIONS = Map.of(
      RoomRole.HOST, EnumSet.allOf(RoomPermission.class),
      RoomRole.CO_HOST, EnumSet.of(CHANGE_GAME, EDIT_GAME_CONFIG, EDIT_SESSION, EDIT_GAME_SELECTION),
      RoomRole.MEMBER, EnumSet.noneOf(RoomPermission.class));

  /** {@code hasRoomPermission(role, permission)}. */
  public static boolean has(RoomRole role, RoomPermission permission) {
    return ROLE_PERMISSIONS.get(role).contains(permission);
  }
}

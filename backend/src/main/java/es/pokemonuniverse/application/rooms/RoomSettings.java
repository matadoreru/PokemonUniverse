package es.pokemonuniverse.application.rooms;

/** {@code env.ROOM_MAX_PLAYERS} y {@code env.RECONNECT_GRACE_MS}. */
public record RoomSettings(int roomMaxPlayers, long reconnectGraceMs) {

  public static final RoomSettings DEFAULTS = new RoomSettings(8, 30_000);
}

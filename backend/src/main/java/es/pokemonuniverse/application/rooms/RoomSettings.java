package es.pokemonuniverse.application.rooms;

/**
 * {@code env.ROOM_MAX_PLAYERS}, {@code env.RECONNECT_GRACE_MS} y {@code env.ROOM_RESULTS_AUTO_CONTINUE_MS} (cuánto
 * esperan los resultados de una partida antes de que la sesión siga sola).
 */
public record RoomSettings(int roomMaxPlayers, long reconnectGraceMs, long resultsAutoContinueMs) {

  public static final long DEFAULT_RESULTS_AUTO_CONTINUE_MS = 20_000;
  public static final RoomSettings DEFAULTS = new RoomSettings(8, 30_000, DEFAULT_RESULTS_AUTO_CONTINUE_MS);

  public RoomSettings(int roomMaxPlayers, long reconnectGraceMs) {
    this(roomMaxPlayers, reconnectGraceMs, DEFAULT_RESULTS_AUTO_CONTINUE_MS);
  }
}

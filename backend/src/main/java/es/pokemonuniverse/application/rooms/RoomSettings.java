package es.pokemonuniverse.application.rooms;

/**
 * {@code env.ROOM_MAX_PLAYERS}, {@code env.RECONNECT_GRACE_MS}, {@code env.ROOM_RESULTS_AUTO_CONTINUE_MS} (cuánto
 * esperan los resultados de una partida antes de que la sesión siga sola) y {@code env.ROOM_GAME_INTRO_MS} (cuánto dura
 * la intro de cada partida; {@code 0} la quita y la partida empieza al lanzarla).
 */
public record RoomSettings(int roomMaxPlayers, long reconnectGraceMs, long resultsAutoContinueMs, long gameIntroMs) {

  public static final long DEFAULT_RESULTS_AUTO_CONTINUE_MS = 20_000;
  public static final long DEFAULT_GAME_INTRO_MS = 8_000;
  public static final RoomSettings DEFAULTS = new RoomSettings(8, 30_000, DEFAULT_RESULTS_AUTO_CONTINUE_MS,
      DEFAULT_GAME_INTRO_MS);

  public RoomSettings(int roomMaxPlayers, long reconnectGraceMs) {
    this(roomMaxPlayers, reconnectGraceMs, DEFAULT_RESULTS_AUTO_CONTINUE_MS, DEFAULT_GAME_INTRO_MS);
  }

  public RoomSettings(int roomMaxPlayers, long reconnectGraceMs, long resultsAutoContinueMs) {
    this(roomMaxPlayers, reconnectGraceMs, resultsAutoContinueMs, DEFAULT_GAME_INTRO_MS);
  }

  /** La misma configuración con otra intro ({@code 0}: sin intro). */
  public RoomSettings withGameIntroMs(long value) {
    return new RoomSettings(roomMaxPlayers, reconnectGraceMs, resultsAutoContinueMs, value);
  }
}

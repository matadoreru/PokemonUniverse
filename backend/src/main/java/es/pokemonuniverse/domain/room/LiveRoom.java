package es.pokemonuniverse.domain.room;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

/**
 * {@code LiveRoom} de {@code rooms/types.ts}. Estado mutable: solo se lee o escribe con {@link #lock} tomado (una
 * sección crítica por sala, constraint 9). Los mapas conservan el orden de inserción como los {@code Map} de JS.
 */
public final class LiveRoom {

  public final ReentrantLock lock = new ReentrantLock();
  /** Chat de la sala: historial, límite de envío y silencios. Solo se toca con {@link #lock}. */
  public final RoomChat chat = new RoomChat();
  public long revision;
  public final String historyId;
  public final String code;
  public String hostId;
  public RoomPhase phase = RoomPhase.LOBBY;
  public final Map<String, RoomMember> members = new LinkedHashMap<>();
  public final int maxPlayers;
  public String selectedGameId;
  public final Map<String, JsonNode> gameConfigs;
  public SessionMode sessionMode = new SessionMode.Infinite();
  /** Empieza en el orden de un solo juego, el elegido al crear la sala. */
  public GameSelectionMode gameSelectionMode;
  /**
   * Modos que se juegan de cada juego con modos en la sesión (al azar, por votación o por orden); solo los que eligió
   * el host (sin entrada, sale el modo de su configuración: {@link GameModes#allowed}).
   */
  public final Map<String, List<String>> allowedModes = new LinkedHashMap<>();
  /** Modo sorteado o votado para el próximo arranque; {@code null} usa el de la configuración. */
  public @Nullable String selectedMode;
  public @Nullable NextGameVote nextGameVote;
  public int gamesPlayed;
  public Map<String, SessionParticipant> sessionParticipants = new LinkedHashMap<>();
  public List<SessionGameSummary> sessionHistory = new ArrayList<>();
  public @Nullable GameRuntime game;
  public @Nullable RoomTimer transitionTimer;
  /**
   * En {@code GAME_RESULTS}, cuándo sigue sola la sesión si el host no lo hace antes; {@code null} si no sigue sola (la
   * sesión ha terminado o es el reto diario) o fuera de los resultados.
   */
  public @Nullable Long resultsEndsAt;
  /** Sala del reto diario: privada, de una cuenta y sin lobby; {@code null} en las salas normales. */
  public @Nullable DailyRoom daily;
  /**
   * Desfase del reloj de la sala sobre la hora real: la partida, sus plazos y el {@code serverNow} de la sala van con
   * {@code hora real + clockOffsetMs}. Solo crece, cuando todos pulsan «Siguiente» en un revelado.
   */
  public long clockOffsetMs;

  /** Hora de la sala para la hora real {@code realNow}. */
  public long now(long realNow) {
    return realNow + clockOffsetMs;
  }
  public final long createdAt;
  public long updatedAt;

  public LiveRoom(String historyId, String code, String hostId, int maxPlayers, String selectedGameId,
      Map<String, JsonNode> gameConfigs, long createdAt) {
    this.historyId = historyId;
    this.code = code;
    this.hostId = hostId;
    this.maxPlayers = maxPlayers;
    this.selectedGameId = selectedGameId;
    this.gameSelectionMode = new GameSelectionMode.Order(List.of(selectedGameId));
    this.gameConfigs = new LinkedHashMap<>(gameConfigs);
    this.createdAt = createdAt;
    this.updatedAt = createdAt;
  }
}

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
  public GameSelectionMode gameSelectionMode = new GameSelectionMode.Fixed();
  public @Nullable NextGameVote nextGameVote;
  public int gamesPlayed;
  public Map<String, SessionParticipant> sessionParticipants = new LinkedHashMap<>();
  public List<SessionGameSummary> sessionHistory = new ArrayList<>();
  public @Nullable GameRuntime game;
  public @Nullable RoomTimer transitionTimer;
  public final long createdAt;
  public long updatedAt;

  public LiveRoom(String historyId, String code, String hostId, int maxPlayers, String selectedGameId,
      Map<String, JsonNode> gameConfigs, long createdAt) {
    this.historyId = historyId;
    this.code = code;
    this.hostId = hostId;
    this.maxPlayers = maxPlayers;
    this.selectedGameId = selectedGameId;
    this.gameConfigs = new LinkedHashMap<>(gameConfigs);
    this.createdAt = createdAt;
    this.updatedAt = createdAt;
  }
}

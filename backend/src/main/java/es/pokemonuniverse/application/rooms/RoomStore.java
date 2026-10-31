package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.room.LiveRoom;
import io.micronaut.core.annotation.Nullable;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * {@code InMemoryRoomStore} de {@code store.ts}: salas por código e índice jugador → sala. Los mapas son concurrentes
 * para que la búsqueda de la sala de un jugador no necesite lock; toda mutación de una sala ocurre bajo su lock.
 * Propietario de un solo proceso: el despliegue multinodo exige estado serializable y temporizadores duraderos.
 */
public final class RoomStore {

  private final Map<String, LiveRoom> rooms = new ConcurrentHashMap<>();
  private final Map<String, String> playerRooms = new ConcurrentHashMap<>();

  public @Nullable LiveRoom get(String code) {
    return rooms.get(code);
  }

  public List<LiveRoom> list() {
    return List.copyOf(rooms.values());
  }

  public @Nullable LiveRoom roomForPlayer(String playerId) {
    var code = playerRooms.get(playerId);
    return code == null ? null : rooms.get(code);
  }

  public void save(LiveRoom room) {
    rooms.put(room.code, room);
  }

  /** Guarda la sala solo si el código está libre (unicidad del código sin lock global). */
  boolean saveIfAbsent(LiveRoom room) {
    return rooms.putIfAbsent(room.code, room) == null;
  }

  public void attachPlayer(String playerId, String roomCode) {
    playerRooms.put(playerId, roomCode);
  }

  /**
   * Asocia al jugador con {@code roomCode} si no pertenece a otra sala viva; atómico por jugador. Devuelve si quedó
   * asociado a {@code roomCode}.
   */
  boolean attachUnlessInOtherRoom(String playerId, String roomCode) {
    var result = playerRooms.compute(playerId, (id, current) ->
        current == null || current.equals(roomCode) || !rooms.containsKey(current) ? roomCode : current);
    return roomCode.equals(result);
  }

  public void detachPlayer(String playerId, String expectedRoomCode) {
    playerRooms.remove(playerId, expectedRoomCode);
  }

  public void delete(String code) {
    var room = rooms.get(code);
    if (room != null) for (var id : List.copyOf(room.members.keySet())) detachPlayer(id, code);
    rooms.remove(code);
  }
}

package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.room.LiveRoom;
import io.micronaut.core.annotation.Nullable;
import java.util.List;
import java.util.Map;
import java.util.Comparator;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * {@code InMemoryRoomStore} de {@code store.ts}: salas por código e índice jugador → sala. Los mapas son concurrentes
 * para que la búsqueda de la sala de un jugador no necesite lock; toda mutación de una sala ocurre bajo su lock.
 * Propietario de un solo proceso: el despliegue multinodo exige estado serializable y temporizadores duraderos.
 * {@link #list()} sigue el orden de inserción, como el {@code Map} de Node (la lista de salas activas de
 * administración depende de él): cada código recibe un número de secuencia al entrar y lo pierde al borrarse.
 */
public final class RoomStore {

  private final Map<String, LiveRoom> rooms = new ConcurrentHashMap<>();
  private final Map<String, String> playerRooms = new ConcurrentHashMap<>();
  private final Map<String, Long> insertion = new ConcurrentHashMap<>();
  private final AtomicLong sequence = new AtomicLong();

  public @Nullable LiveRoom get(String code) {
    return rooms.get(code);
  }

  public List<LiveRoom> list() {
    return rooms.values().stream()
        .sorted(Comparator.comparingLong(room -> insertion.getOrDefault(room.code, Long.MAX_VALUE)))
        .toList();
  }

  public @Nullable LiveRoom roomForPlayer(String playerId) {
    var code = playerRooms.get(playerId);
    return code == null ? null : rooms.get(code);
  }

  public void save(LiveRoom room) {
    rooms.put(room.code, room);
    insertion.computeIfAbsent(room.code, code -> sequence.incrementAndGet());
  }

  /** Guarda la sala solo si el código está libre (unicidad del código sin lock global). */
  boolean saveIfAbsent(LiveRoom room) {
    if (rooms.putIfAbsent(room.code, room) != null) return false;
    insertion.computeIfAbsent(room.code, code -> sequence.incrementAndGet());
    return true;
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
    insertion.remove(code);
  }
}

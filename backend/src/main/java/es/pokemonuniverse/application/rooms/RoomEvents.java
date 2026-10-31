package es.pokemonuniverse.application.rooms;

/**
 * Puerto de salida hacia las conexiones ({@code io.to(socketId).emit} de Node). Se invoca con el lock de la sala
 * tomado: las implementaciones no deben bloquear.
 */
public interface RoomEvents {

  /** Envía {@code event} a la conexión {@code connectionId} del miembro {@code memberId}. */
  void sendToMember(String memberId, String connectionId, String event, Object payload);

  /** {@code room:kicked} con el motivo y desvinculación de la conexión de la sala. */
  void kick(String memberId, String connectionId, String reason);
}

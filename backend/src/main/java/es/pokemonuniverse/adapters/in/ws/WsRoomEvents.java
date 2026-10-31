package es.pokemonuniverse.adapters.in.ws;

import es.pokemonuniverse.application.rooms.RoomEvents;
import jakarta.inject.Singleton;

/**
 * {@link RoomEvents} sobre {@code /ws}: cada emisión se serializa en el momento (dentro del lock de la sala, así refleja
 * ese estado) y se envía sin bloquear. Una conexión que ya no existe se ignora, como un socket desconectado en Node.
 */
@Singleton
public class WsRoomEvents implements RoomEvents {

  private final WsSessions sessions;

  public WsRoomEvents(WsSessions sessions) {
    this.sessions = sessions;
  }

  @Override
  public void sendToMember(String memberId, String connectionId, String event, Object payload) {
    sessions.push(memberId, connectionId, event, payload);
  }

  /** {@code room:kicked}; el coordinador ya sacó al miembro, así que la conexión deja de recibir la sala. */
  @Override
  public void kick(String memberId, String connectionId, String reason) {
    sessions.push(memberId, connectionId, "room:kicked", reason);
  }
}

package es.pokemonuniverse.application.friends;

/** Puerto de conexiones en vivo por cuenta: lo implementa el transporte {@code /ws}. */
public interface UserConnections {

  /** Si la cuenta tiene al menos una conexión abierta. */
  boolean isOnline(String userId);

  /** Envía {@code {event, payload}} a todas las conexiones abiertas de la cuenta, sin bloquear; sin conexiones, nada. */
  void send(String userId, String event, Object payload);
}

package es.pokemonuniverse.application.friends;

/** Presencia de un amigo en este momento. */
public enum FriendStatus {
  OFFLINE,
  ONLINE,
  IN_ROOM,
  PLAYING;

  /** Posición en la lista de amigos: primero quien juega, después en sala, conectado y desconectado. */
  int listRank() {
    return switch (this) {
      case PLAYING -> 0;
      case IN_ROOM -> 1;
      case ONLINE -> 2;
      case OFFLINE -> 3;
    };
  }
}

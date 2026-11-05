package es.pokemonuniverse.application.rooms;

/** Dónde está una cuenta según el coordinador: fuera de sala, en una sala, o en una sala con partida en curso. */
public enum RoomOccupancy {
  NONE,
  IN_ROOM,
  PLAYING
}

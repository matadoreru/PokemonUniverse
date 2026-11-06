package es.pokemonuniverse.domain.room;

/** {@code GameFinishReason}: se reclama de forma síncrona antes de que la sala avance. */
public enum GameFinishReason {
  COMPLETED,
  SKIPPED,
  /** Reto diario: la sala se cerró con la partida a medias. */
  ABANDONED
}

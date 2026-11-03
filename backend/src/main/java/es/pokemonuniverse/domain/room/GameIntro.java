package es.pokemonuniverse.domain.room;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Intro de una partida: la sala la mantiene en {@code GAME_STARTING} sin arrancar el motor hasta {@code endsAt} o hasta
 * que todos los jugadores conectados han pulsado «Saltar». Solo se lee o escribe con el lock de la sala.
 */
public final class GameIntro {

  /** {@code resultId} de la partida presentada. */
  public final String gameInstanceId;
  public final long endsAt;
  /** Jugadores que han pulsado «Saltar», en orden. */
  public final Set<String> skippedIds = new LinkedHashSet<>();

  public GameIntro(String gameInstanceId, long endsAt) {
    this.gameInstanceId = gameInstanceId;
    this.endsAt = endsAt;
  }
}

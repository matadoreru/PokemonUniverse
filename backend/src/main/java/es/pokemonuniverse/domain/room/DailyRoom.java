package es.pokemonuniverse.domain.room;

import es.pokemonuniverse.domain.daily.DailyOutcome;
import io.micronaut.core.annotation.Nullable;
import java.time.LocalDate;
import java.util.SortedMap;
import java.util.TreeMap;

/**
 * Marca de una sala del reto diario ({@link LiveRoom#daily}): la partida de una sola cuenta, sin lobby. Mutable solo
 * con el lock de la sala tomado.
 */
public final class DailyRoom {

  /** Id de la fila {@code DailyResult} que se insertó como {@code STARTED} antes de crear la sala. */
  public final String resultRowId;
  public final String userId;
  /** Fecha de Madrid en la que empezó la partida (a la que pertenece). */
  public final LocalDate date;
  public final String gameId;
  public final int roundCount;
  /** Ronda base 1 → valor de esa ronda, según se observan las difusiones. */
  public final SortedMap<Integer, Integer> outcomes = new TreeMap<>();
  /** Resultado de la partida; lo fija {@code DailyRunListener.finished} al terminar. */
  public @Nullable DailyOutcome outcome;

  public DailyRoom(String resultRowId, String userId, LocalDate date, String gameId, int roundCount) {
    this.resultRowId = resultRowId;
    this.userId = userId;
    this.date = date;
    this.gameId = gameId;
    this.roundCount = roundCount;
  }
}

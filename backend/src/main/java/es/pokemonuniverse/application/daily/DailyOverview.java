package es.pokemonuniverse.application.daily;

import io.micronaut.core.annotation.Nullable;
import java.util.List;

/**
 * El reto de hoy para una cuenta: el juego (el de la fila de {@code DailyChallenge} o, sin fila, el del sorteo), cuántas
 * cuentas lo han terminado y el estado propio. Nunca lleva contenido de la partida.
 */
public record DailyOverview(String date, String resetsAt, String gameId, String name, String icon, int roundCount,
    long players, String status, @Nullable MyResult result) {

  /** Resultado propio de hoy, solo si está {@code FINISHED}; {@code total} son las cuentas que lo han terminado. */
  public record MyResult(int score, int correct, int roundCount, List<Integer> rounds, int position, long total) {

    public MyResult {
      rounds = List.copyOf(rounds);
    }
  }
}

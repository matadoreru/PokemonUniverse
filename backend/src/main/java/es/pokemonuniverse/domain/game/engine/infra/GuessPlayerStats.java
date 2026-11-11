package es.pokemonuniverse.domain.game.engine.infra;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.serde.annotation.Serdeable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Estadísticas de jugador de los juegos de adivinar el Pokémon: los contadores de {@link GuessSolveStats} más
 * {@code missed}. Muchos contadores contiguos: fuera de este record solo se construye con {@link #ZERO},
 * {@link #withSolve} ({@code recordGuessSolve}) y los métodos con nombre.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record GuessPlayerStats(int correct, int missed, int totalAttempts, int firstTry, int roundFirsts,
    long solveTimeTotalMs, long bestTimeMs, int pointsFromRounds) implements GuessSolveStats<GuessPlayerStats> {

  public static final GuessPlayerStats ZERO = new GuessPlayerStats(0, 0, 0, 0, 0, 0, 0, 0);

  @Override
  public GuessPlayerStats withSolve(int correct, int totalAttempts, int firstTry, int roundFirsts,
      long solveTimeTotalMs, long bestTimeMs, int pointsFromRounds) {
    return new GuessPlayerStats(correct, missed, totalAttempts, firstTry, roundFirsts, solveTimeTotalMs, bestTimeMs,
        pointsFromRounds);
  }

  /** Ronda resuelta sin acierto. */
  public GuessPlayerStats afterMiss() {
    return new GuessPlayerStats(correct, missed + 1, totalAttempts, firstTry, roundFirsts, solveTimeTotalMs,
        bestTimeMs, pointsFromRounds);
  }

  /** Intento fallido. */
  public GuessPlayerStats afterWrongAttempt() {
    return new GuessPlayerStats(correct, missed, totalAttempts + 1, firstTry, roundFirsts, solveTimeTotalMs,
        bestTimeMs, pointsFromRounds);
  }

  /** {@code { ...entry.stats }} con las claves de TS, en su orden. */
  public Map<String, Number> toMap() {
    var mapped = new LinkedHashMap<String, Number>();
    mapped.put("correct", correct);
    mapped.put("missed", missed);
    mapped.put("totalAttempts", totalAttempts);
    mapped.put("firstTry", firstTry);
    mapped.put("roundFirsts", roundFirsts);
    mapped.put("solveTimeTotalMs", solveTimeTotalMs);
    mapped.put("bestTimeMs", bestTimeMs);
    mapped.put("pointsFromRounds", pointsFromRounds);
    return mapped;
  }
}

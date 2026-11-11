package es.pokemonuniverse.domain.game.engine.infra;

/**
 * Contadores comunes de aciertos ({@code GuessSolveStats}, antes en {@code guessing-round.ts}). Lo implementa
 * {@link GuessPlayerStats}; {@link #withSolve} devuelve una copia que conserva los campos que no cuenta (p. ej.
 * {@code missed}), como el {@code { ...stats, ... }} de TS.
 */
public interface GuessSolveStats<T extends GuessSolveStats<T>> {

  int correct();

  int totalAttempts();

  int firstTry();

  int roundFirsts();

  long solveTimeTotalMs();

  long bestTimeMs();

  int pointsFromRounds();

  T withSolve(int correct, int totalAttempts, int firstTry, int roundFirsts, long solveTimeTotalMs, long bestTimeMs,
      int pointsFromRounds);
}

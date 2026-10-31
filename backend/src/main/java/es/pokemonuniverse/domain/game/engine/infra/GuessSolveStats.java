package es.pokemonuniverse.domain.game.engine.infra;

/**
 * Contadores comunes de aciertos ({@code GuessSolveStats} de {@code guessing-round.ts}). Cada motor lo implementa con
 * su record de estadísticas; {@link #withSolve} devuelve una copia que conserva sus campos propios (p. ej.
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

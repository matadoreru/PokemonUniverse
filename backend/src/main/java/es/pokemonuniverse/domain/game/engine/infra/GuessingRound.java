package es.pokemonuniverse.domain.game.engine.infra;

import es.pokemonuniverse.domain.game.engine.GameActionResult;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import io.micronaut.core.annotation.Nullable;
import java.util.List;
import java.util.function.Function;
import java.util.function.UnaryOperator;

/** Traducción literal de {@code games/infrastructure/guessing-round.ts}: contabilidad común de aciertos. */
public final class GuessingRound {

  private GuessingRound() {}

  /**
   * Guardas comunes de la acción de adivinar, en este orden: ronda activa, jugador requerido, sin acierto previo,
   * plazo ({@link Timing#deadlinePassedOrMissing}: sin plazo cuenta como vencido) y cooldown. Devuelve el rechazo de
   * la primera que falla, o {@code null} si la acción sigue. {@code onExpired} da el estado con el que se rechaza el
   * intento tardío (en casi todos los juegos, la ronda ya resuelta) y solo se evalúa en ese rechazo.
   */
  public static <S extends GuessingState> @Nullable GameActionResult<S> precheck(S state, String playerId,
      GameContext context, String alreadySolvedMessage, UnaryOperator<S> onExpired) {
    if (state.phase() != GamePhase.ROUND_ACTIVE) return GameActionResult.reject(state, "No hay una ronda activa.");
    if (!state.playerIds().contains(playerId) || !context.isPlayerRequired(playerId)) {
      return GameActionResult.reject(state, "Estás observando esta ronda.");
    }
    if (state.solves().containsKey(playerId)) return GameActionResult.reject(state, alreadySolvedMessage);
    if (Timing.deadlinePassedOrMissing(context.now(), state.roundEndsAt())) {
      return GameActionResult.reject(onExpired.apply(state), "El tiempo ha terminado.");
    }
    var cooldown = state.cooldownUntil().get(playerId);
    if (Timing.cooldownRemainingMs(context.now(), cooldown) > 0) {
      return GameActionResult.reject(state, Timing.cooldownMessage(context.now(), cooldown));
    }
    return null;
  }

  /** Las respuestas aceptadas y la política de puntos siguen siendo del juego. */
  public static <T extends GuessSolveStats<T>> T recordGuessSolve(T stats, int attemptCount, int solveOrder,
      long elapsedMs, int points) {
    return stats.withSolve(
        stats.correct() + 1,
        stats.totalAttempts() + 1,
        stats.firstTry() + (attemptCount == 1 ? 1 : 0),
        stats.roundFirsts() + (solveOrder == 1 ? 1 : 0),
        stats.solveTimeTotalMs() + elapsedMs,
        stats.bestTimeMs() <= 0 ? elapsedMs : Math.min(stats.bestTimeMs(), elapsedMs),
        stats.pointsFromRounds() + points);
  }

  /**
   * Fallos de la ronda en la vista pública: todos con {@code publicAttempts}; si no, ninguno (nadie ve los fallos de
   * los demás).
   */
  public static <T> List<T> publicAttempts(boolean publicAttempts, List<T> attempts) {
    return publicAttempts ? attempts : List.of();
  }

  /**
   * Fallos propios en la vista de {@code playerId}: {@code null} (no se envía) con {@code publicAttempts}, porque ya
   * van en la vista pública; si no, solo los suyos.
   */
  public static <T> @Nullable List<T> ownAttempts(boolean publicAttempts, List<T> attempts,
      Function<T, String> playerOf, String playerId) {
    if (publicAttempts) return null;
    return attempts.stream().filter(attempt -> playerId.equals(playerOf.apply(attempt))).toList();
  }

  /**
   * Fallos de la ronda para quien dibuja o describe: {@code null} (no se envía) con {@code publicAttempts}, porque ya
   * van en la vista pública; si no, todos, porque los necesita para guiar su dibujo o descripción.
   */
  public static <T> @Nullable List<T> guideAttempts(boolean publicAttempts, List<T> attempts) {
    return publicAttempts ? null : attempts;
  }
}

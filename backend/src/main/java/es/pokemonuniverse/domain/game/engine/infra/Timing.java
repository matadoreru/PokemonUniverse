package es.pokemonuniverse.domain.game.engine.infra;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.json.JsNumbers;
import io.micronaut.core.annotation.Nullable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.function.Predicate;

/** Traducción literal del TS que antes estaba en {@code games/infrastructure/timing.ts}. */
public final class Timing {

  private Timing() {}

  /** {@code now >= (deadline ?? Infinity)}: sin plazo, nunca vence. */
  public static boolean deadlineReached(long now, @Nullable Long deadline) {
    return deadline != null && now >= deadline;
  }

  /**
   * {@code now >= (deadline ?? 0)}: sin plazo, cualquier instante cuenta como vencido. No se intercambia con
   * {@link #deadlineReached}, que con un plazo nulo da lo contrario.
   */
  public static boolean deadlinePassedOrMissing(long now, @Nullable Long deadline) {
    return now >= (deadline == null ? 0 : deadline);
  }

  public static long cooldownRemainingMs(long now, @Nullable Long cooldownUntil) {
    return Math.max(0, (cooldownUntil == null ? 0 : cooldownUntil) - now);
  }

  public static String cooldownMessage(long now, @Nullable Long cooldownUntil) {
    double seconds = Math.ceil(cooldownRemainingMs(now, cooldownUntil) / 100.0) / 10;
    return "Espera " + JsNumbers.format(seconds) + "s antes de volver a intentar.";
  }

  /** Copia con el plazo del jugador; una clave existente conserva su posición, como el spread de JS. */
  public static Map<String, Long> setPlayerCooldown(Map<String, Long> cooldowns, String playerId, long now, long durationMs) {
    var result = new LinkedHashMap<>(cooldowns);
    result.put(playerId, now + durationMs);
    return result;
  }

  /** Ciclo común activo → resultados → siguiente/fin; los juegos solo inyectan sus transiciones. */
  public static <S extends TimedGameState> S advanceTimedRound(S state, GameContext context, TimedRoundStrategy<S> strategy) {
    if (state.phase() == GamePhase.ROUND_RESULTS && deadlineReached(context.now(), state.nextTransitionAt())) {
      return strategy.isComplete(state) ? strategy.finish(state, context) : strategy.beginNext(state, context);
    }
    if (state.phase() != GamePhase.ROUND_ACTIVE) return state;
    if (deadlineReached(context.now(), state.roundEndsAt())) return strategy.resolveActive(state, context);
    return strategy.tickActive(state, context);
  }

  /** Los cambios de presencia usan la misma regla de compleción que las acciones. */
  public static <S extends TimedGameState> S resolveWhenRequiredPlayersComplete(S state, GameContext context,
      List<String> playerIds, Predicate<String> completed, BiFunction<S, GameContext, S> resolve, GamePhase activePhase) {
    return state.phase() == activePhase && context.allConnectedRequiredCompleted(playerIds, completed)
        ? resolve.apply(state, context)
        : state;
  }

  public static <S extends TimedGameState> S resolveWhenRequiredPlayersComplete(S state, GameContext context,
      List<String> playerIds, Predicate<String> completed, BiFunction<S, GameContext, S> resolve) {
    return resolveWhenRequiredPlayersComplete(state, context, playerIds, completed, resolve, GamePhase.ROUND_ACTIVE);
  }
}

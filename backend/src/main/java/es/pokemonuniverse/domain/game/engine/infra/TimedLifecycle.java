package es.pokemonuniverse.domain.game.engine.infra;

import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.core.annotation.Nullable;
import java.util.List;

/** Traducción literal de {@code timedGameLifecycle} ({@code games/infrastructure/lifecycle.ts}). */
public final class TimedLifecycle {

  private TimedLifecycle() {}

  public static GameLifecycle of(GamePhase phase, @Nullable Long roundEndsAt, @Nullable Long nextTransitionAt,
      @Nullable Long roundStartedAt, @Nullable Integer roundNumber, @Nullable Integer turnNumber,
      @Nullable Integer turnIndex, @Nullable Integer currentLotIndex, @Nullable Integer voteRoundNumber,
      @Nullable String currentTeam) {
    return of(phase, roundEndsAt, nextTransitionAt, roundStartedAt, roundNumber, turnNumber, turnIndex, currentLotIndex,
        voteRoundNumber, currentTeam, List.of());
  }

  /**
   * {@code actionEpoch} es byte a byte {@code JSON.stringify([phase, roundNumber, roundStartedAt, turnNumber, turnIndex,
   * currentLotIndex, voteRoundNumber, currentTeam])} con {@code undefined} → {@code null}.
   */
  public static GameLifecycle of(GamePhase phase, @Nullable Long roundEndsAt, @Nullable Long nextTransitionAt,
      @Nullable Long roundStartedAt, @Nullable Integer roundNumber, @Nullable Integer turnNumber,
      @Nullable Integer turnIndex, @Nullable Integer currentLotIndex, @Nullable Integer voteRoundNumber,
      @Nullable String currentTeam, @Nullable List<String> spectatorIds) {
    Long nextDeadline = roundEndsAt == null ? nextTransitionAt
        : nextTransitionAt == null ? roundEndsAt : Long.valueOf(Math.min(roundEndsAt, nextTransitionAt));
    var epoch = "[" + JsonTree.quote(phase.name()) + "," + number(roundNumber) + "," + number(roundStartedAt) + ","
        + number(turnNumber) + "," + number(turnIndex) + "," + number(currentLotIndex) + ","
        + number(voteRoundNumber) + "," + (currentTeam == null ? "null" : JsonTree.quote(currentTeam)) + "]";
    return new GameLifecycle(phase, nextDeadline, epoch, spectatorIds == null ? List.of() : List.copyOf(spectatorIds));
  }

  private static String number(@Nullable Number value) {
    return value == null ? "null" : value.toString();
  }
}

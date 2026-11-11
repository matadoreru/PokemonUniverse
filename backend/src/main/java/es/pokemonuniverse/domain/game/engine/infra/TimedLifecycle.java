package es.pokemonuniverse.domain.game.engine.infra;

import es.pokemonuniverse.domain.game.engine.GameLifecycle;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.core.annotation.Nullable;
import java.util.List;
import java.util.Objects;

/**
 * Traducción literal de {@code timedGameLifecycle}, que antes estaba en {@code games/infrastructure/lifecycle.ts}. Los
 * campos se fijan por nombre en un {@link Builder}; los no fijados son el {@code undefined} de TS.
 */
public final class TimedLifecycle {

  private TimedLifecycle() {}

  public static Builder builder(GamePhase phase) {
    return new Builder(phase);
  }

  public static final class Builder {
    private final GamePhase phase;
    private Long roundEndsAt;
    private Long nextTransitionAt;
    private Long roundStartedAt;
    private Integer roundNumber;
    private Integer turnNumber;
    private Integer turnIndex;
    private Integer currentLotIndex;
    private Integer voteRoundNumber;
    private String currentTeam;
    private List<String> spectatorIds = List.of();

    private Builder(GamePhase phase) {
      this.phase = Objects.requireNonNull(phase, "phase");
    }

    public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

    public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

    public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

    public Builder roundNumber(@Nullable Integer value) { roundNumber = value; return this; }

    public Builder turnNumber(@Nullable Integer value) { turnNumber = value; return this; }

    public Builder turnIndex(@Nullable Integer value) { turnIndex = value; return this; }

    public Builder currentLotIndex(@Nullable Integer value) { currentLotIndex = value; return this; }

    public Builder voteRoundNumber(@Nullable Integer value) { voteRoundNumber = value; return this; }

    public Builder currentTeam(@Nullable String value) { currentTeam = value; return this; }

    /** {@code state.spectatorIds ?? []}. */
    public Builder spectatorIds(@Nullable List<String> value) {
      spectatorIds = value == null ? List.of() : List.copyOf(value);
      return this;
    }

    /**
     * {@code actionEpoch} es byte a byte {@code JSON.stringify([phase, roundNumber, roundStartedAt, turnNumber,
     * turnIndex, currentLotIndex, voteRoundNumber, currentTeam])} con {@code undefined} → {@code null}.
     */
    public GameLifecycle build() {
      Long nextDeadline = roundEndsAt == null ? nextTransitionAt
          : nextTransitionAt == null ? roundEndsAt : Long.valueOf(Math.min(roundEndsAt, nextTransitionAt));
      var epoch = "[" + JsonTree.quote(phase.name()) + "," + number(roundNumber) + "," + number(roundStartedAt) + ","
          + number(turnNumber) + "," + number(turnIndex) + "," + number(currentLotIndex) + ","
          + number(voteRoundNumber) + "," + (currentTeam == null ? "null" : JsonTree.quote(currentTeam)) + "]";
      return new GameLifecycle(phase, nextDeadline, epoch, spectatorIds);
    }

    private static String number(@Nullable Number value) {
      return value == null ? "null" : value.toString();
    }
  }
}

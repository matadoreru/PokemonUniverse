package es.pokemonuniverse.golden;

import es.pokemonuniverse.domain.game.engine.GamePlayer;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** Formato de {@code packages/shared/golden/types.ts}; las partes opacas se quedan como {@link JsonNode}. */
@Serdeable
public record GoldenFixture(
    String engineId,
    String scenario,
    long seed,
    String catalog,
    List<GamePlayer> players,
    JsonNode config,
    @Nullable Long startNow,
    @Nullable String roomCode,
    List<Step> steps,
    Expected expected,
    @Nullable Integer stoppedAt) {

  /** {@code kind}: {@code action} (playerId, action), {@code timeout} o {@code presence} (players). */
  @Serdeable
  public record Step(String kind, @Nullable String playerId, @Nullable JsonNode action,
      @Nullable List<GamePlayer> players, long now) {}

  @Serdeable
  public record Snapshot(JsonNode lifecycle, JsonNode publicState, JsonNode playerStates, boolean finished) {}

  /** O {@code threw}, o {@code snapshot} con {@code accepted}/{@code error} opcionales (ausentes en TS = nulos). */
  @Serdeable
  public record StepResult(@Nullable Boolean accepted, @Nullable String error, @Nullable Snapshot snapshot,
      @Nullable String threw) {}

  @Serdeable
  public record Expected(JsonNode configNormalized, Snapshot initial, Snapshot afterStart, List<StepResult> afterSteps,
      @Nullable JsonNode results) {}

  /** Entrada de {@code config-cases.json}: {@code normalized} solo existe si {@code valid}. */
  @Serdeable
  public record ConfigCase(JsonNode input, boolean valid, @Nullable JsonNode normalized) {}
}

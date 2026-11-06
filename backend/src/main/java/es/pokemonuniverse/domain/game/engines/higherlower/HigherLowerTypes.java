package es.pokemonuniverse.domain.game.engines.higherlower;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerConfig.HigherLowerCategory;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code higher-lower/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class HigherLowerTypes {

  private HigherLowerTypes() {}

  public enum HigherLowerChoice { HIGHER, SAME, LOWER }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record HigherLowerAnswer(HigherLowerChoice choice, long answeredAt) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record HigherLowerStats(int correct, int incorrect, int sameCorrect, int answered, int bestStreak) {

    static final HigherLowerStats ZERO = new HigherLowerStats(0, 0, 0, 0, 0);
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record HigherLowerOutcome(@Nullable HigherLowerChoice choice, boolean correct, int basePoints,
      int streakBonus, int speedBonus, int awardedPoints, int streak) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record HigherLowerRoundResult(int previousValue, int currentValue, HigherLowerChoice correctAnswer,
      Map<String, HigherLowerOutcome> outcomes) {

    public HigherLowerRoundResult {
      outcomes = frozenMap(outcomes);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 16 campos no se usa en el motor).
   * {@code alive} solo cuenta en {@code ENDLESS}: quien sigue en pie, en el orden de {@code playerIds}.
   */
  public record HigherLowerState(
      GamePhase phase,
      HigherLowerConfig config,
      List<String> playerIds,
      int roundNumber,
      String previousPokemonId,
      @Nullable String currentPokemonId,
      @Nullable HigherLowerCategory category,
      Map<String, HigherLowerAnswer> answers,
      Map<String, Integer> scores,
      Map<String, Integer> streaks,
      Map<String, HigherLowerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable HigherLowerRoundResult lastRound,
      List<String> alive) implements TimedGameState {

    public HigherLowerState {
      playerIds = frozenList(playerIds);
      answers = frozenMap(answers);
      scores = frozenMap(scores);
      streaks = frozenMap(streaks);
      playerStats = frozenMap(playerStats);
      alive = frozenList(alive);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).roundNumber(roundNumber)
          .previousPokemonId(previousPokemonId).currentPokemonId(currentPokemonId).category(category).answers(answers)
          .scores(scores).streaks(streaks).playerStats(playerStats).roundStartedAt(roundStartedAt)
          .roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).lastRound(lastRound).alive(alive);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    HigherLowerState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Mapas vacíos por defecto; el resto de campos obligatorios los valida el constructor al hacer {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private HigherLowerConfig config;
      private List<String> playerIds = List.of();
      private int roundNumber;
      private String previousPokemonId;
      private String currentPokemonId;
      private HigherLowerCategory category;
      private Map<String, HigherLowerAnswer> answers = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, Integer> streaks = Map.of();
      private Map<String, HigherLowerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private HigherLowerRoundResult lastRound;
      private List<String> alive = List.of();

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(HigherLowerConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder previousPokemonId(String value) { previousPokemonId = value; return this; }

      public Builder currentPokemonId(@Nullable String value) { currentPokemonId = value; return this; }

      public Builder category(@Nullable HigherLowerCategory value) { category = value; return this; }

      public Builder answers(Map<String, HigherLowerAnswer> value) { answers = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder streaks(Map<String, Integer> value) { streaks = value; return this; }

      public Builder playerStats(Map<String, HigherLowerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable HigherLowerRoundResult value) { lastRound = value; return this; }

      public Builder alive(List<String> value) { alive = value; return this; }

      public HigherLowerState build() {
        return new HigherLowerState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, roundNumber, Objects.requireNonNull(previousPokemonId, "previousPokemonId"), currentPokemonId,
            category, answers, scores, streaks, playerStats, roundStartedAt, roundEndsAt, nextTransitionAt, lastRound, alive);
      }
    }
  }

  /** {@code higherLowerActionSchema}: {@code { type: 'ANSWER', choice }} estricto. */
  public record HigherLowerAction(HigherLowerChoice choice) {

    private static final Set<String> KEYS = Set.of("type", "choice");

    public static HigherLowerAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"ANSWER".equals(type.getStringValue())) throw invalid();
      var choice = raw.get("choice");
      if (choice == null || !choice.isString()) throw invalid();
      for (var value : HigherLowerChoice.values()) {
        if (value.name().equals(choice.getStringValue())) return new HigherLowerAction(value);
      }
      throw invalid();
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Higher or Lower no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record HigherLowerPokemonView(String id, String name, String sprite, @Nullable Integer value) {}

  /**
   * Estado público. {@code mode} va siempre detrás de {@code phase}; {@code alive} solo sale en {@code ENDLESS}
   * (ausente en Clásico, así su proyección no cambia). En {@code ENDLESS}, {@code totalRounds} es el tope de seguridad.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record HigherLowerPublicState(
      String gameId,
      GamePhase phase,
      HigherLowerMode mode,
      List<String> playerIds,
      int roundNumber,
      int totalRounds,
      HigherLowerCategory category,
      HigherLowerPokemonView previousPokemon,
      HigherLowerPokemonView currentPokemon,
      Map<String, HigherLowerAnswer> answers,
      List<String> answeredIds,
      Map<String, Integer> scores,
      Map<String, Integer> streaks,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<String> alive,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable HigherLowerRoundResult lastRound,
      @Nullable GameResults results) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record HigherLowerPlayerState(boolean canAnswer, @Nullable HigherLowerAnswer answer) {}
}

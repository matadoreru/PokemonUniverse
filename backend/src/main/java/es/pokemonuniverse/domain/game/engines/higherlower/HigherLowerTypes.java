package es.pokemonuniverse.domain.game.engines.higherlower;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.game.engines.higherlower.HigherLowerConfig.HigherLowerCategory;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Tipos de {@code higher-lower/types.ts}. Los {@code Record<string, …>} son {@link LinkedHashMap} inmutables (orden de
 * inserción, como un objeto JS con claves no numéricas); cada transición crea copias nuevas.
 */
public final class HigherLowerTypes {

  private HigherLowerTypes() {}

  /** Copia inmutable que conserva el orden de inserción. */
  static <V> Map<String, V> frozen(Map<String, V> map) {
    return Collections.unmodifiableMap(new LinkedHashMap<>(map));
  }

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
      int streakBonus, int awardedPoints, int streak) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record HigherLowerRoundResult(int previousValue, int currentValue, HigherLowerChoice correctAnswer,
      Map<String, HigherLowerOutcome> outcomes) {

    public HigherLowerRoundResult {
      outcomes = frozen(outcomes);
    }
  }

  /** Estado opaco del servidor; nunca se serializa hacia los clientes. */
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
      @Nullable HigherLowerRoundResult lastRound) implements TimedGameState {

    public HigherLowerState {
      playerIds = List.copyOf(playerIds);
      answers = frozen(answers);
      scores = frozen(scores);
      streaks = frozen(streaks);
      playerStats = frozen(playerStats);
    }

    HigherLowerState withAnswers(Map<String, HigherLowerAnswer> value) {
      return new HigherLowerState(phase, config, playerIds, roundNumber, previousPokemonId, currentPokemonId, category,
          value, scores, streaks, playerStats, roundStartedAt, roundEndsAt, nextTransitionAt, lastRound);
    }

    HigherLowerState withPreviousPokemonId(String value) {
      return new HigherLowerState(phase, config, playerIds, roundNumber, value, currentPokemonId, category,
          answers, scores, streaks, playerStats, roundStartedAt, roundEndsAt, nextTransitionAt, lastRound);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    HigherLowerState finished() {
      return new HigherLowerState(GamePhase.GAME_RESULTS, config, playerIds, roundNumber, previousPokemonId,
          currentPokemonId, category, answers, scores, streaks, playerStats, roundStartedAt, null, null, lastRound);
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

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record HigherLowerPublicState(
      String gameId,
      GamePhase phase,
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
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable HigherLowerRoundResult lastRound,
      @Nullable GameResults results) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record HigherLowerPlayerState(boolean canAnswer, @Nullable HigherLowerAnswer answer) {}
}

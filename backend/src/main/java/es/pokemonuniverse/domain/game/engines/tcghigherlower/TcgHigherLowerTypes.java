package es.pokemonuniverse.domain.game.engines.tcghigherlower;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog.Card;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Estado, acciones y proyecciones; las proyecciones tienen su tipo TS en {@code tcg-higher-lower/types.ts}.
 * Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción; cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class TcgHigherLowerTypes {

  private TcgHigherLowerTypes() {}

  /** {@code TCG_HIGHER_LOWER_CHOICES}. */
  public enum TcgHigherLowerChoice { LOWER, SAME, HIGHER }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TcgHigherLowerAnswer(TcgHigherLowerChoice choice, long answeredAt) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TcgHigherLowerStats(int comparisons, int correct, int incorrect, int sameCorrect, int answered,
      int bestStreak) {

    static final TcgHigherLowerStats ZERO = new TcgHigherLowerStats(0, 0, 0, 0, 0, 0);

    /** Una comparación revelada más: {@code correct}, si acertó un {@code SAME}, si respondió y la racha nueva. */
    TcgHigherLowerStats afterComparison(boolean wasCorrect, boolean sameCorrectNow, boolean wasAnswered, int streak) {
      return new TcgHigherLowerStats(comparisons + 1, correct + (wasCorrect ? 1 : 0), incorrect + (wasCorrect ? 0 : 1),
          sameCorrect + (sameCorrectNow ? 1 : 0), answered + (wasAnswered ? 1 : 0), Math.max(bestStreak, streak));
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TcgHigherLowerOutcome(@Nullable TcgHigherLowerChoice choice, boolean correct, int awardedPoints,
      int streak) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TcgHigherLowerRoundResult(String previousPrice, String currentPrice,
      TcgHigherLowerChoice correctAnswer, Map<String, TcgHigherLowerOutcome> outcomes) {

    public TcgHigherLowerRoundResult {
      outcomes = frozenMap(outcomes);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}. {@code sequence} son las {@code rounds + 1} cartas del mazo.
   */
  public record TcgHigherLowerState(
      GamePhase phase,
      TcgHigherLowerConfig config,
      List<String> playerIds,
      List<Card> sequence,
      int roundNumber,
      Map<String, TcgHigherLowerAnswer> answers,
      Map<String, Integer> scores,
      Map<String, Integer> streaks,
      Map<String, TcgHigherLowerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable TcgHigherLowerRoundResult lastRound) implements TimedGameState {

    public TcgHigherLowerState {
      playerIds = frozenList(playerIds);
      sequence = frozenList(sequence);
      answers = frozenMap(answers);
      scores = frozenMap(scores);
      streaks = frozenMap(streaks);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).sequence(sequence).roundNumber(roundNumber)
          .answers(answers).scores(scores).streaks(streaks).playerStats(playerStats).roundStartedAt(roundStartedAt)
          .roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    TcgHigherLowerState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Colecciones vacías por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private TcgHigherLowerConfig config;
      private List<String> playerIds = List.of();
      private List<Card> sequence = List.of();
      private int roundNumber;
      private Map<String, TcgHigherLowerAnswer> answers = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, Integer> streaks = Map.of();
      private Map<String, TcgHigherLowerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private TcgHigherLowerRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(TcgHigherLowerConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder sequence(List<Card> value) { sequence = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder answers(Map<String, TcgHigherLowerAnswer> value) { answers = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder streaks(Map<String, Integer> value) { streaks = value; return this; }

      public Builder playerStats(Map<String, TcgHigherLowerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable TcgHigherLowerRoundResult value) { lastRound = value; return this; }

      public TcgHigherLowerState build() {
        return new TcgHigherLowerState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, sequence, roundNumber, answers, scores, streaks, playerStats, roundStartedAt, roundEndsAt,
            nextTransitionAt, lastRound);
      }
    }
  }

  /** {@code tcgHigherLowerActionSchema}: {@code { type: 'ANSWER', choice }} estricto. */
  public record TcgHigherLowerAction(TcgHigherLowerChoice choice) {

    private static final Set<String> KEYS = Set.of("type", "choice");

    public static TcgHigherLowerAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"ANSWER".equals(type.getStringValue())) throw invalid();
      var choice = raw.get("choice");
      if (choice == null || !choice.isString()) throw invalid();
      for (var value : TcgHigherLowerChoice.values()) {
        if (value.name().equals(choice.getStringValue())) return new TcgHigherLowerAction(value);
      }
      throw invalid();
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Higher or Lower: Cartas no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TcgCardPublicView(String id, String name, String localId, String setId, String setName,
      @Nullable String rarity, String imageUrl, @Nullable String price) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TcgHigherLowerPublicState(
      String gameId,
      GamePhase phase,
      List<String> playerIds,
      int roundNumber,
      int totalRounds,
      String currency,
      TcgCardPublicView previousCard,
      TcgCardPublicView currentCard,
      List<String> answeredIds,
      Map<String, Integer> scores,
      Map<String, Integer> streaks,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable TcgHigherLowerRoundResult lastRound,
      @Nullable GameResults results) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TcgHigherLowerPlayerState(boolean canAnswer, @Nullable TcgHigherLowerAnswer answer) {}
}

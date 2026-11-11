package es.pokemonuniverse.domain.game.engines.wouldyourather;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Estado, acciones y proyecciones; las proyecciones tienen su tipo TS en {@code would-you-rather/types.ts}.
 * Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class WouldYouRatherTypes {

  private WouldYouRatherTypes() {}

  /** {@code wouldYouRatherOptionSchema}: {@code z.enum(['A', 'B'])}. */
  public enum WouldYouRatherOption { A, B }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WouldYouRatherBallot(WouldYouRatherOption preference, WouldYouRatherOption prediction) {}

  /** {@code WouldYouRatherStats}: siete contadores contiguos, que se derivan con métodos con nombre. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WouldYouRatherStats(int roundsPlayed, int ballotsSubmitted, int roundsMissed, int majorityChoices,
      int correctPredictions, int perfectRounds, int pointsFromRounds) {

    /** {@code emptyWouldYouRatherStats()}. */
    public static final WouldYouRatherStats ZERO = new WouldYouRatherStats(0, 0, 0, 0, 0, 0, 0);

    /** Cierre de ronda de {@code resolveRound}; {@code result} es nulo si el jugador no envió papeleta. */
    WouldYouRatherStats afterRound(@Nullable WouldYouRatherPlayerRoundResult result) {
      boolean submitted = result != null;
      return new WouldYouRatherStats(roundsPlayed + 1, ballotsSubmitted + (submitted ? 1 : 0),
          roundsMissed + (submitted ? 0 : 1), majorityChoices + (submitted && result.majorityPoint() != 0 ? 1 : 0),
          correctPredictions + (submitted && result.predictionPoints() != 0 ? 1 : 0),
          perfectRounds + (submitted && result.totalPoints() == 3 ? 1 : 0),
          pointsFromRounds + (submitted ? result.totalPoints() : 0));
    }

    /** {@code { ...stats }} para la clasificación, en el orden de claves de TS. */
    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("roundsPlayed", roundsPlayed);
      mapped.put("ballotsSubmitted", ballotsSubmitted);
      mapped.put("roundsMissed", roundsMissed);
      mapped.put("majorityChoices", majorityChoices);
      mapped.put("correctPredictions", correctPredictions);
      mapped.put("perfectRounds", perfectRounds);
      mapped.put("pointsFromRounds", pointsFromRounds);
      return mapped;
    }
  }

  /**
   * {@code { playerId, ...ballot, majorityPoint, predictionPoints, totalPoints }}: el orden de claves es el del literal
   * de {@code resolveRound}, no el de la interfaz.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WouldYouRatherPlayerRoundResult(String playerId, WouldYouRatherOption preference,
      WouldYouRatherOption prediction, int majorityPoint, int predictionPoints, int totalPoints) {

    /** Puntos de una papeleta frente a la mayoría ({@code null} si hubo empate). */
    static WouldYouRatherPlayerRoundResult scored(String playerId, WouldYouRatherBallot ballot,
        @Nullable WouldYouRatherOption majority) {
      int majorityPoint = majority != null && ballot.preference() == majority
          ? WouldYouRatherRules.MAJORITY_POINTS : 0;
      int predictionPoints = majority != null && ballot.prediction() == majority
          ? WouldYouRatherRules.PREDICTION_POINTS : 0;
      return new WouldYouRatherPlayerRoundResult(playerId, ballot.preference(), ballot.prediction(), majorityPoint,
          predictionPoints, majorityPoint + predictionPoints);
    }
  }

  /** {@code { optionA, optionB }} de una pareja, sin su id. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WouldYouRatherPrompt(String optionA, String optionB) {

    static WouldYouRatherPrompt of(WouldYouRatherPromptPair pair) {
      return new WouldYouRatherPrompt(pair.optionA(), pair.optionB());
    }
  }

  /** {@code totals} es el literal {@code { A, B }}: un mapa con las claves {@code "A"} y {@code "B"} en ese orden. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WouldYouRatherRoundResult(
      WouldYouRatherPrompt prompt,
      Map<String, Integer> totals,
      @Nullable WouldYouRatherOption majority,
      List<WouldYouRatherPlayerRoundResult> players,
      List<String> missingPlayerIds) {

    public WouldYouRatherRoundResult {
      totals = frozenMap(totals);
      players = frozenList(players);
      missingPlayerIds = frozenList(missingPlayerIds);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record WouldYouRatherState(
      GamePhase phase,
      WouldYouRatherConfig config,
      List<String> playerIds,
      List<WouldYouRatherPromptPair> promptPool,
      List<String> usedPromptIds,
      int roundNumber,
      @Nullable String currentPromptId,
      Map<String, WouldYouRatherBallot> ballots,
      Map<String, Integer> scores,
      Map<String, WouldYouRatherStats> playerStats,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable WouldYouRatherRoundResult lastRound) implements TimedGameState {

    public WouldYouRatherState {
      playerIds = frozenList(playerIds);
      promptPool = frozenList(promptPool);
      usedPromptIds = frozenList(usedPromptIds);
      ballots = frozenMap(ballots);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).promptPool(promptPool)
          .usedPromptIds(usedPromptIds).roundNumber(roundNumber).currentPromptId(currentPromptId).ballots(ballots)
          .scores(scores).playerStats(playerStats).roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt)
          .lastRound(lastRound);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private WouldYouRatherConfig config;
      private List<String> playerIds = List.of();
      private List<WouldYouRatherPromptPair> promptPool = List.of();
      private List<String> usedPromptIds = List.of();
      private int roundNumber;
      private String currentPromptId;
      private Map<String, WouldYouRatherBallot> ballots = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, WouldYouRatherStats> playerStats = Map.of();
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private WouldYouRatherRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(WouldYouRatherConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder promptPool(List<WouldYouRatherPromptPair> value) { promptPool = value; return this; }

      public Builder usedPromptIds(List<String> value) { usedPromptIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder currentPromptId(@Nullable String value) { currentPromptId = value; return this; }

      public Builder ballots(Map<String, WouldYouRatherBallot> value) { ballots = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, WouldYouRatherStats> value) { playerStats = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable WouldYouRatherRoundResult value) { lastRound = value; return this; }

      public WouldYouRatherState build() {
        return new WouldYouRatherState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, promptPool, usedPromptIds, roundNumber, currentPromptId, ballots, scores, playerStats,
            roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /** {@code wouldYouRatherActionSchema}: objeto estricto {@code SUBMIT_BALLOT}. */
  public record WouldYouRatherAction(WouldYouRatherOption preference, WouldYouRatherOption prediction) {

    private static final Set<String> KEYS = Set.of("type", "preference", "prediction");

    static WouldYouRatherAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !type.getStringValue().equals("SUBMIT_BALLOT")) throw invalid();
      return new WouldYouRatherAction(option(raw.get("preference")), option(raw.get("prediction")));
    }

    private static WouldYouRatherOption option(@Nullable JsonNode value) {
      if (value != null && value.isString()) {
        for (var constant : WouldYouRatherOption.values()) {
          if (constant.name().equals(value.getStringValue())) return constant;
        }
      }
      throw invalid();
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Would You Rather no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WouldYouRatherPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      WouldYouRatherPrompt prompt,
      List<String> playerIds,
      List<String> submittedPlayerIds,
      Map<String, Integer> scores,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable WouldYouRatherRoundResult lastRound,
      @Nullable GameResults results) {}

  /** Las dos variantes de TS ({@code PLAYER}/{@code SPECTATOR}) tienen las mismas claves: un único record. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WouldYouRatherPlayerState(String role, boolean canSubmit, @Nullable WouldYouRatherBallot ownBallot) {

    static final WouldYouRatherPlayerState SPECTATOR = new WouldYouRatherPlayerState("SPECTATOR", false, null);
  }
}

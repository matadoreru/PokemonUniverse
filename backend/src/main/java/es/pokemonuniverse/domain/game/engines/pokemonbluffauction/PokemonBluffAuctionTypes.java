package es.pokemonuniverse.domain.game.engines.pokemonbluffauction;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.json.JsNumbers;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.conditions.Condition;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code pokemon-bluff-auction/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokemonBluffAuctionTypes {

  private PokemonBluffAuctionTypes() {}

  /** {@code BluffAuctionCuratedCategory}, en el orden de las claves de {@code curatedCategoryDexNumbers}. */
  public enum BluffAuctionCuratedCategory { DOG, CAT, STARTER, FOSSIL, PSEUDO_LEGENDARY, ULTRA_BEAST }

  /**
   * {@code BluffAuctionRule}: una condición compartida ({@code BingoCondition}) o una categoría curada. Nunca sale en
   * las proyecciones (solo su descripción), así que la condición compartida va envuelta en {@link Standard}.
   */
  public sealed interface BluffAuctionRule {

    record Standard(Condition condition) implements BluffAuctionRule {}

    record CuratedCategory(BluffAuctionCuratedCategory category) implements BluffAuctionRule {}
  }

  /** {@code BluffAuctionCondition}: la condición de una ronda, que solo ve el servidor. */
  public record BluffAuctionCondition(String key, List<BluffAuctionRule> conditions, String description,
      List<String> clauses) {

    public BluffAuctionCondition {
      conditions = frozenList(conditions);
      clauses = frozenList(clauses);
    }
  }

  /** {@code BluffAuctionCondition & { candidatePokemonIds }}: una plantilla de {@code buildBluffAuctionConditions}. */
  public record BluffAuctionConditionTemplate(String key, List<BluffAuctionRule> conditions, String description,
      List<String> clauses, List<String> candidatePokemonIds) {

    public BluffAuctionConditionTemplate {
      conditions = frozenList(conditions);
      clauses = frozenList(clauses);
      candidatePokemonIds = frozenList(candidatePokemonIds);
    }

    /** {@code { key, conditions, description, clauses }} de {@code beginRound}. */
    BluffAuctionCondition condition() {
      return new BluffAuctionCondition(key, conditions, description, clauses);
    }
  }

  /** {@code { description, clauses }}: lo que se publica de una condición. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BluffAuctionConditionView(String description, List<String> clauses) {

    public BluffAuctionConditionView {
      clauses = frozenList(clauses);
    }
  }

  /**
   * {@code BluffAuctionBidEvent}: las dos variantes de la unión ({@code BID} con {@code amount}, {@code PASS} sin esa
   * clave) en un único record; {@code amount} se omite cuando es nulo.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BluffAuctionBidEvent(String playerId, String type,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Integer amount) {

    static BluffAuctionBidEvent bid(String playerId, int amount) {
      return new BluffAuctionBidEvent(playerId, "BID", amount);
    }

    static BluffAuctionBidEvent pass(String playerId) {
      return new BluffAuctionBidEvent(playerId, "PASS", null);
    }
  }

  /** {@code BluffAuctionPokemonView}: tres textos contiguos, que se construyen con {@link #of}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BluffAuctionPokemonView(String id, String name, String sprite) {

    static BluffAuctionPokemonView of(Pokemon pokemon) {
      return new BluffAuctionPokemonView(pokemon.id(), pokemon.name(), pokemon.sprite());
    }
  }

  /** {@code BluffAuctionAttempt}; {@code result} es {@code CORRECT}, {@code INCORRECT} o {@code DUPLICATE}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BluffAuctionAttempt(BluffAuctionPokemonView pokemon, String result, long submittedAt) {}

  /**
   * {@code BluffAuctionPlayerStats}: nueve contadores contiguos, que se derivan de {@link #EMPTY} con métodos con
   * nombre. El orden de {@link #toMap()} es el de {@code emptyBluffAuctionStats()}.
   */
  public record BluffAuctionPlayerStats(int roundsWon, int bidderRounds, int completedBids, int failedBids,
      int correctPokemon, int incorrectPokemon, int highestCompletedBid, int highestAttemptedBid, int impossibleBids) {

    /** {@code emptyBluffAuctionStats()}. */
    static final BluffAuctionPlayerStats EMPTY = new BluffAuctionPlayerStats(0, 0, 0, 0, 0, 0, 0, 0, 0);

    /** {@code updateBidderStartStats}: una ronda más como apostador y la mayor apuesta intentada. */
    BluffAuctionPlayerStats afterBidderStart(int bid) {
      return new BluffAuctionPlayerStats(roundsWon, bidderRounds + 1, completedBids, failedBids, correctPokemon,
          incorrectPokemon, highestCompletedBid, Math.max(highestAttemptedBid, bid), impossibleBids);
    }

    /** Un intento de demostración, correcto o no. */
    BluffAuctionPlayerStats afterAttempt(boolean correct) {
      return new BluffAuctionPlayerStats(roundsWon, bidderRounds, completedBids, failedBids,
          correctPokemon + (correct ? 1 : 0), incorrectPokemon + (correct ? 0 : 1), highestCompletedBid,
          highestAttemptedBid, impossibleBids);
    }

    /** El cierre de ronda de {@code finishRound} para un jugador. */
    BluffAuctionPlayerStats afterRound(boolean success, boolean bidder, int bid, boolean impossible) {
      return new BluffAuctionPlayerStats(
          roundsWon + ((success && bidder) || (!success && !bidder) ? 1 : 0),
          bidderRounds,
          completedBids + (success && bidder ? 1 : 0),
          failedBids + (!success && bidder ? 1 : 0),
          correctPokemon,
          incorrectPokemon,
          Math.max(highestCompletedBid, success && bidder ? bid : 0),
          highestAttemptedBid,
          impossibleBids + (bidder && impossible ? 1 : 0));
    }

    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("roundsWon", roundsWon);
      mapped.put("bidderRounds", bidderRounds);
      mapped.put("completedBids", completedBids);
      mapped.put("failedBids", failedBids);
      mapped.put("correctPokemon", correctPokemon);
      mapped.put("incorrectPokemon", incorrectPokemon);
      mapped.put("highestCompletedBid", highestCompletedBid);
      mapped.put("highestAttemptedBid", highestAttemptedBid);
      mapped.put("impossibleBids", impossibleBids);
      return mapped;
    }
  }

  /**
   * {@code BluffAuctionRoundResult}; {@code reason} es {@code COMPLETED}, {@code TIMEOUT}, {@code IMPOSSIBLE} o
   * {@code BIDDER_LEFT} y {@code validPokemonCount} solo se informa en las imposibles. Se construye con
   * {@link #builder()}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BluffAuctionRoundResult(String bidderId, int bid, boolean success, String reason,
      BluffAuctionConditionView condition, List<BluffAuctionAttempt> attempts, int correctCount, int incorrectCount,
      @Nullable Integer validPokemonCount, Map<String, Integer> pointsAwarded) {

    public BluffAuctionRoundResult {
      attempts = frozenList(attempts);
      pointsAwarded = frozenMap(pointsAwarded);
    }

    public static Builder builder() {
      return new Builder();
    }

    /** Setters con nombre: {@link #build()} exige los campos no nulos. */
    public static final class Builder {
      private String bidderId;
      private int bid;
      private boolean success;
      private String reason;
      private BluffAuctionConditionView condition;
      private List<BluffAuctionAttempt> attempts = List.of();
      private int correctCount;
      private int incorrectCount;
      private Integer validPokemonCount;
      private Map<String, Integer> pointsAwarded = Map.of();

      private Builder() {}

      public Builder bidderId(String value) { bidderId = value; return this; }

      public Builder bid(int value) { bid = value; return this; }

      public Builder success(boolean value) { success = value; return this; }

      public Builder reason(String value) { reason = value; return this; }

      public Builder condition(BluffAuctionConditionView value) { condition = value; return this; }

      public Builder attempts(List<BluffAuctionAttempt> value) { attempts = value; return this; }

      public Builder correctCount(int value) { correctCount = value; return this; }

      public Builder incorrectCount(int value) { incorrectCount = value; return this; }

      public Builder validPokemonCount(@Nullable Integer value) { validPokemonCount = value; return this; }

      public Builder pointsAwarded(Map<String, Integer> value) { pointsAwarded = value; return this; }

      public BluffAuctionRoundResult build() {
        return new BluffAuctionRoundResult(Objects.requireNonNull(bidderId, "bidderId"), bid, success,
            Objects.requireNonNull(reason, "reason"), Objects.requireNonNull(condition, "condition"), attempts,
            correctCount, incorrectCount, validPokemonCount, pointsAwarded);
      }
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record PokemonBluffAuctionState(
      GamePhase phase,
      PokemonBluffAuctionConfig config,
      List<String> playerIds,
      List<String> poolIds,
      List<BluffAuctionConditionTemplate> conditionTemplates,
      List<String> usedConditionKeys,
      int roundNumber,
      @Nullable BluffAuctionCondition condition,
      List<String> validPokemonIds,
      List<String> bidOrder,
      int turnIndex,
      List<String> passedPlayerIds,
      @Nullable Integer currentBid,
      @Nullable String currentBidderId,
      List<BluffAuctionBidEvent> bidHistory,
      @Nullable String bidderId,
      @Nullable Integer targetBid,
      List<BluffAuctionAttempt> attempts,
      List<String> usedPokemonIds,
      int correctCount,
      int incorrectCount,
      Map<String, Integer> scores,
      Map<String, BluffAuctionPlayerStats> playerStats,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable BluffAuctionRoundResult lastRound) {

    public PokemonBluffAuctionState {
      playerIds = frozenList(playerIds);
      poolIds = frozenList(poolIds);
      conditionTemplates = frozenList(conditionTemplates);
      usedConditionKeys = frozenList(usedConditionKeys);
      validPokemonIds = frozenList(validPokemonIds);
      bidOrder = frozenList(bidOrder);
      passedPlayerIds = frozenList(passedPlayerIds);
      bidHistory = frozenList(bidHistory);
      attempts = frozenList(attempts);
      usedPokemonIds = frozenList(usedPokemonIds);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).poolIds(poolIds)
          .conditionTemplates(conditionTemplates).usedConditionKeys(usedConditionKeys).roundNumber(roundNumber)
          .condition(condition).validPokemonIds(validPokemonIds).bidOrder(bidOrder).turnIndex(turnIndex)
          .passedPlayerIds(passedPlayerIds).currentBid(currentBid).currentBidderId(currentBidderId)
          .bidHistory(bidHistory).bidderId(bidderId).targetBid(targetBid).attempts(attempts)
          .usedPokemonIds(usedPokemonIds).correctCount(correctCount).incorrectCount(incorrectCount).scores(scores)
          .playerStats(playerStats).roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** Listas y mapas vacíos por defecto; {@code phase} y {@code config} los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokemonBluffAuctionConfig config;
      private List<String> playerIds = List.of();
      private List<String> poolIds = List.of();
      private List<BluffAuctionConditionTemplate> conditionTemplates = List.of();
      private List<String> usedConditionKeys = List.of();
      private int roundNumber;
      private BluffAuctionCondition condition;
      private List<String> validPokemonIds = List.of();
      private List<String> bidOrder = List.of();
      private int turnIndex;
      private List<String> passedPlayerIds = List.of();
      private Integer currentBid;
      private String currentBidderId;
      private List<BluffAuctionBidEvent> bidHistory = List.of();
      private String bidderId;
      private Integer targetBid;
      private List<BluffAuctionAttempt> attempts = List.of();
      private List<String> usedPokemonIds = List.of();
      private int correctCount;
      private int incorrectCount;
      private Map<String, Integer> scores = Map.of();
      private Map<String, BluffAuctionPlayerStats> playerStats = Map.of();
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private BluffAuctionRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokemonBluffAuctionConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder conditionTemplates(List<BluffAuctionConditionTemplate> value) {
        conditionTemplates = value;
        return this;
      }

      public Builder usedConditionKeys(List<String> value) { usedConditionKeys = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder condition(@Nullable BluffAuctionCondition value) { condition = value; return this; }

      public Builder validPokemonIds(List<String> value) { validPokemonIds = value; return this; }

      public Builder bidOrder(List<String> value) { bidOrder = value; return this; }

      public Builder turnIndex(int value) { turnIndex = value; return this; }

      public Builder passedPlayerIds(List<String> value) { passedPlayerIds = value; return this; }

      public Builder currentBid(@Nullable Integer value) { currentBid = value; return this; }

      public Builder currentBidderId(@Nullable String value) { currentBidderId = value; return this; }

      public Builder bidHistory(List<BluffAuctionBidEvent> value) { bidHistory = value; return this; }

      public Builder bidderId(@Nullable String value) { bidderId = value; return this; }

      public Builder targetBid(@Nullable Integer value) { targetBid = value; return this; }

      public Builder attempts(List<BluffAuctionAttempt> value) { attempts = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder correctCount(int value) { correctCount = value; return this; }

      public Builder incorrectCount(int value) { incorrectCount = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, BluffAuctionPlayerStats> value) { playerStats = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable BluffAuctionRoundResult value) { lastRound = value; return this; }

      public PokemonBluffAuctionState build() {
        return new PokemonBluffAuctionState(Objects.requireNonNull(phase, "phase"),
            Objects.requireNonNull(config, "config"), playerIds, poolIds, conditionTemplates, usedConditionKeys,
            roundNumber, condition, validPokemonIds, bidOrder, turnIndex, passedPlayerIds, currentBid, currentBidderId,
            bidHistory, bidderId, targetBid, attempts, usedPokemonIds, correctCount, incorrectCount, scores,
            playerStats, roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /** Proyección pública; se construye con {@link #builder()} para no confundir contadores contiguos. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonBluffAuctionPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      List<String> playerIds,
      @Nullable BluffAuctionConditionView condition,
      List<String> bidOrder,
      @Nullable String currentTurnPlayerId,
      List<String> passedPlayerIds,
      @Nullable Integer currentBid,
      int minimumBid,
      @Nullable String currentBidderId,
      List<BluffAuctionBidEvent> bidHistory,
      int maxBid,
      @Nullable String bidderId,
      @Nullable Integer targetBid,
      List<BluffAuctionAttempt> attempts,
      int correctCount,
      int incorrectCount,
      int remainingCount,
      Map<String, Integer> scores,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable BluffAuctionRoundResult lastRound,
      @Nullable GameResults results) {

    public PokemonBluffAuctionPublicState {
      playerIds = frozenList(playerIds);
      bidOrder = frozenList(bidOrder);
      passedPlayerIds = frozenList(passedPlayerIds);
      bidHistory = frozenList(bidHistory);
      attempts = frozenList(attempts);
      scores = frozenMap(scores);
    }

    public static Builder builder() {
      return new Builder();
    }

    /** Setters con nombre: {@link #build()} exige los campos no nulos. */
    public static final class Builder {
      private String gameId;
      private GamePhase phase;
      private int roundNumber;
      private int totalRounds;
      private List<String> playerIds = List.of();
      private BluffAuctionConditionView condition;
      private List<String> bidOrder = List.of();
      private String currentTurnPlayerId;
      private List<String> passedPlayerIds = List.of();
      private Integer currentBid;
      private int minimumBid;
      private String currentBidderId;
      private List<BluffAuctionBidEvent> bidHistory = List.of();
      private int maxBid;
      private String bidderId;
      private Integer targetBid;
      private List<BluffAuctionAttempt> attempts = List.of();
      private int correctCount;
      private int incorrectCount;
      private int remainingCount;
      private Map<String, Integer> scores = Map.of();
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private BluffAuctionRoundResult lastRound;
      private GameResults results;

      private Builder() {}

      public Builder gameId(String value) { gameId = value; return this; }

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder totalRounds(int value) { totalRounds = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder condition(@Nullable BluffAuctionConditionView value) { condition = value; return this; }

      public Builder bidOrder(List<String> value) { bidOrder = value; return this; }

      public Builder currentTurnPlayerId(@Nullable String value) { currentTurnPlayerId = value; return this; }

      public Builder passedPlayerIds(List<String> value) { passedPlayerIds = value; return this; }

      public Builder currentBid(@Nullable Integer value) { currentBid = value; return this; }

      public Builder minimumBid(int value) { minimumBid = value; return this; }

      public Builder currentBidderId(@Nullable String value) { currentBidderId = value; return this; }

      public Builder bidHistory(List<BluffAuctionBidEvent> value) { bidHistory = value; return this; }

      public Builder maxBid(int value) { maxBid = value; return this; }

      public Builder bidderId(@Nullable String value) { bidderId = value; return this; }

      public Builder targetBid(@Nullable Integer value) { targetBid = value; return this; }

      public Builder attempts(List<BluffAuctionAttempt> value) { attempts = value; return this; }

      public Builder correctCount(int value) { correctCount = value; return this; }

      public Builder incorrectCount(int value) { incorrectCount = value; return this; }

      public Builder remainingCount(int value) { remainingCount = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable BluffAuctionRoundResult value) { lastRound = value; return this; }

      public Builder results(@Nullable GameResults value) { results = value; return this; }

      public PokemonBluffAuctionPublicState build() {
        return new PokemonBluffAuctionPublicState(Objects.requireNonNull(gameId, "gameId"),
            Objects.requireNonNull(phase, "phase"), roundNumber, totalRounds, playerIds, condition, bidOrder,
            currentTurnPlayerId, passedPlayerIds, currentBid, minimumBid, currentBidderId, bidHistory, maxBid, bidderId,
            targetBid, attempts, correctCount, incorrectCount, remainingCount, scores, roundEndsAt, nextTransitionAt,
            lastRound, results);
      }
    }
  }

  /** {@code PokemonBluffAuctionPlayerState}: un espectador nunca puede actuar. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonBluffAuctionPlayerState(String role, boolean canRaise, boolean canPass,
      boolean canSubmitPokemon) {

    static final PokemonBluffAuctionPlayerState SPECTATOR =
        new PokemonBluffAuctionPlayerState("SPECTATOR", false, false, false);
  }

  /**
   * {@code pokemonBluffAuctionActionSchema}: unión discriminada por {@code type}, cada variante estricta.
   * {@code amount} es un entero seguro ({@code .int()} de Zod 4 = {@code Number.isSafeInteger}) {@code >= 1}, que
   * cabe en un {@code long}; {@code pokemonId} mide 1–96 unidades UTF-16.
   */
  public sealed interface PokemonBluffAuctionAction {

    record RaiseBid(long amount) implements PokemonBluffAuctionAction {}

    record PassBid() implements PokemonBluffAuctionAction {}

    record SubmitPokemon(String pokemonId) implements PokemonBluffAuctionAction {}

    static PokemonBluffAuctionAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "RAISE_BID" -> {
          strict(raw, Set.of("type", "amount"));
          var amount = raw.get("amount");
          if (amount == null || !amount.isNumber()) throw invalid();
          double value = amount.getDoubleValue();
          if (!JsNumbers.isSafeInteger(value) || value < 1) throw invalid();
          yield new RaiseBid((long) value);
        }
        case "PASS_BID" -> {
          strict(raw, Set.of("type"));
          yield new PassBid();
        }
        case "SUBMIT_POKEMON" -> {
          strict(raw, Set.of("type", "pokemonId"));
          var pokemonId = raw.get("pokemonId");
          if (pokemonId == null || !pokemonId.isString()) throw invalid();
          var text = pokemonId.getStringValue();
          if (text.isEmpty() || text.length() > 96) throw invalid();
          yield new SubmitPokemon(text);
        }
        default -> throw invalid();
      };
    }

    private static void strict(JsonNode raw, Set<String> keys) {
      for (var entry : raw.entries()) {
        if (!keys.contains(entry.getKey())) throw invalid();
      }
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Pokémon Bluff Auction no válida.");
    }
  }
}

package es.pokemonuniverse.domain.game.engines.shinyvote;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.AssetResolution.Recolor;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code shiny-vote/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class ShinyVoteTypes {

  private ShinyVoteTypes() {}

  /** {@code SHINY_OPTION_IDS}. */
  public enum ShinyOptionId { A, B, C, D, E, F }

  /** {@code ShinyOption}: lo que ve el cliente; {@code sprite} es la ruta opaca de la sala. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ShinyOption(ShinyOptionId id, String pokemonId, String pokemonName, String sprite) {}

  /** {@code ShinyOptionState} (solo en el estado): {@code recolor} nulo identifica el shiny oficial. */
  public record ShinyOptionState(ShinyOptionId id, String pokemonId, String pokemonName, String sprite,
      @Nullable Recolor recolor) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ShinyVote(ShinyOptionId optionId, long votedAt) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ShinyPlayerStats(int votes, int correctVotes) {

    static final ShinyPlayerStats ZERO = new ShinyPlayerStats(0, 0);
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ShinyRoundResult(int roundNumber, ShinyOptionId correctOptionId, Map<String, ShinyVote> votes,
      List<String> correctPlayerIds, List<String> missedPlayerIds) {

    public ShinyRoundResult {
      votes = frozenMap(votes);
      correctPlayerIds = frozenList(correctPlayerIds);
      missedPlayerIds = frozenList(missedPlayerIds);
    }

    /** {@code { ...lastRound, votes: {}, correctPlayerIds: [], missedPlayerIds: [] }} con los votos ocultos. */
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ShinyPlayerRoundResult(boolean correct, int points) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ShinyVotePlayerState(boolean canVote, @Nullable ShinyVote vote,
      @Nullable ShinyPlayerRoundResult roundResult) {}

  /** Opciones generadas de una ronda ({@code { options, correctOptionId }} de {@code createOptions}). */
  public record ShinyGeneratedOptions(List<ShinyOptionState> options, ShinyOptionId correctOptionId) {

    public ShinyGeneratedOptions {
      options = frozenList(options);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 16 campos no se usa en el motor).
   */
  public record ShinyVoteState(
      GamePhase phase,
      ShinyVoteConfig config,
      String assetToken,
      List<String> playerIds,
      int roundNumber,
      List<ShinyOptionState> options,
      @Nullable ShinyOptionId correctOptionId,
      Map<String, ShinyVote> votes,
      Map<String, Integer> scores,
      Map<String, ShinyPlayerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable ShinyRoundResult lastRound,
      @Nullable List<ShinyOptionState> preparedOptions,
      @Nullable ShinyOptionId preparedCorrectOptionId) implements TimedGameState {

    public ShinyVoteState {
      playerIds = frozenList(playerIds);
      options = frozenList(options);
      votes = frozenMap(votes);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
      preparedOptions = preparedOptions == null ? null : frozenList(preparedOptions);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).assetToken(assetToken).playerIds(playerIds)
          .roundNumber(roundNumber).options(options).correctOptionId(correctOptionId).votes(votes).scores(scores)
          .playerStats(playerStats).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound).preparedOptions(preparedOptions)
          .preparedCorrectOptionId(preparedCorrectOptionId);
    }

    /** {@code finishGame}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    ShinyVoteState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@link #build()} exige {@code phase}, {@code config} y {@code assetToken}. */
    public static final class Builder {
      private GamePhase phase;
      private ShinyVoteConfig config;
      private String assetToken;
      private List<String> playerIds = List.of();
      private int roundNumber;
      private List<ShinyOptionState> options = List.of();
      private ShinyOptionId correctOptionId;
      private Map<String, ShinyVote> votes = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, ShinyPlayerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private ShinyRoundResult lastRound;
      private List<ShinyOptionState> preparedOptions;
      private ShinyOptionId preparedCorrectOptionId;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(ShinyVoteConfig value) { config = value; return this; }

      public Builder assetToken(String value) { assetToken = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder options(List<ShinyOptionState> value) { options = value; return this; }

      public Builder correctOptionId(@Nullable ShinyOptionId value) { correctOptionId = value; return this; }

      public Builder votes(Map<String, ShinyVote> value) { votes = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, ShinyPlayerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable ShinyRoundResult value) { lastRound = value; return this; }

      public Builder preparedOptions(@Nullable List<ShinyOptionState> value) { preparedOptions = value; return this; }

      public Builder preparedCorrectOptionId(@Nullable ShinyOptionId value) {
        preparedCorrectOptionId = value;
        return this;
      }

      /** {@code Pick<ShinyVoteState, 'preparedOptions' | 'preparedCorrectOptionId'>}: nulo deja ambos a null. */
      public Builder prepared(@Nullable ShinyGeneratedOptions value) {
        preparedOptions = value == null ? null : value.options();
        preparedCorrectOptionId = value == null ? null : value.correctOptionId();
        return this;
      }

      public ShinyVoteState build() {
        return new ShinyVoteState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            Objects.requireNonNull(assetToken, "assetToken"), playerIds, roundNumber, options, correctOptionId,
            votes, scores, playerStats, roundStartedAt, roundEndsAt, nextTransitionAt, lastRound, preparedOptions,
            preparedCorrectOptionId);
      }
    }
  }

  /** {@code shinyVoteActionSchema}: {@code { type: 'VOTE', optionId: 'A'…'F' }} estricto. */
  public record ShinyVoteAction(ShinyOptionId optionId) {

    private static final Set<String> KEYS = Set.of("type", "optionId");

    public static ShinyVoteAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"VOTE".equals(type.getStringValue())) throw invalid();
      var optionId = raw.get("optionId");
      if (optionId == null || !optionId.isString()) throw invalid();
      for (var id : ShinyOptionId.values()) {
        if (id.name().equals(optionId.getStringValue())) return new ShinyVoteAction(id);
      }
      throw invalid();
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Shiny Quiz no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ShinyVotePublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      List<String> playerIds,
      List<ShinyOption> options,
      Map<String, ShinyVote> votes,
      List<String> votedPlayerIds,
      ShinyVoteConfig.VoteVisibility voteVisibility,
      List<String> pendingPlayerIds,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable ShinyOptionId correctOptionId,
      @Nullable ShinyRoundResult lastRound,
      @Nullable String winnerId,
      @Nullable GameResults results) {}
}

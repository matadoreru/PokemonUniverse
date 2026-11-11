package es.pokemonuniverse.domain.game.engines.mostlikelyto;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.infra.RunoffVoting.RunoffVoteRound;
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
 * Estado, acciones y proyecciones; las proyecciones tienen su tipo TS en {@code most-likely-to/types.ts}.
 * Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class MostLikelyToTypes {

  private MostLikelyToTypes() {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record MostLikelyToPokemon(String id, String name, String sprite) {}

  /** {@code MostLikelyToStats}: nueve contadores contiguos, que se derivan con métodos con nombre. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record MostLikelyToStats(int roundsPlayed, int answersSubmitted, int roundsMissed, int votesCast,
      int votesReceived, int roundWins, int soloWins, int sharedWins, int pointsFromRounds) {

    /** {@code emptyMostLikelyToStats()}. */
    public static final MostLikelyToStats ZERO = new MostLikelyToStats(0, 0, 0, 0, 0, 0, 0, 0, 0);

    MostLikelyToStats afterVote() {
      return new MostLikelyToStats(roundsPlayed, answersSubmitted, roundsMissed, votesCast + 1, votesReceived,
          roundWins, soloWins, sharedWins, pointsFromRounds);
    }

    /** Cierre de ronda de {@code finishRound}. */
    MostLikelyToStats afterRound(boolean answered, int receivedVotes, boolean won, int winnerCount, int points) {
      return new MostLikelyToStats(roundsPlayed + 1, answersSubmitted + (answered ? 1 : 0),
          roundsMissed + (answered ? 0 : 1), votesCast, votesReceived + receivedVotes, roundWins + (won ? 1 : 0),
          soloWins + (won && winnerCount == 1 ? 1 : 0), sharedWins + (won && winnerCount > 1 ? 1 : 0),
          pointsFromRounds + points);
    }

    /** {@code { ...stats }} para la clasificación, en el orden de claves de TS. */
    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("roundsPlayed", roundsPlayed);
      mapped.put("answersSubmitted", answersSubmitted);
      mapped.put("roundsMissed", roundsMissed);
      mapped.put("votesCast", votesCast);
      mapped.put("votesReceived", votesReceived);
      mapped.put("roundWins", roundWins);
      mapped.put("soloWins", soloWins);
      mapped.put("sharedWins", sharedWins);
      mapped.put("pointsFromRounds", pointsFromRounds);
      return mapped;
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record MostLikelyToVoteRound(int number, List<String> candidateIds, Map<String, String> votes) {

    public MostLikelyToVoteRound {
      candidateIds = frozenList(candidateIds);
      votes = frozenMap(votes);
    }

    static MostLikelyToVoteRound of(RunoffVoteRound round) {
      return new MostLikelyToVoteRound(round.number(), round.candidateIds(), round.votes());
    }
  }

  /** Respuesta de {@code lastRound.answers}: {@code { playerId, pokemon, votesReceived, won }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record MostLikelyToResultAnswer(String playerId, MostLikelyToPokemon pokemon, int votesReceived,
      boolean won) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record MostLikelyToRoundResult(
      String prompt,
      List<MostLikelyToResultAnswer> answers,
      List<MostLikelyToVoteRound> voteRounds,
      List<String> winnerIds,
      Map<String, Integer> pointsAwarded) {

    public MostLikelyToRoundResult {
      answers = frozenList(answers);
      voteRounds = frozenList(voteRounds);
      winnerIds = frozenList(winnerIds);
      pointsAwarded = frozenMap(pointsAwarded);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record MostLikelyToState(
      GamePhase phase,
      MostLikelyToConfig config,
      List<String> playerIds,
      List<String> pokemonPoolIds,
      List<SubjectiveCategory> promptPool,
      List<String> usedPromptIds,
      int roundNumber,
      @Nullable String currentPromptId,
      Map<String, MostLikelyToPokemon> selections,
      Map<String, String> votes,
      List<String> voteCandidates,
      int voteRoundNumber,
      List<MostLikelyToVoteRound> voteHistory,
      Map<String, Integer> scores,
      Map<String, MostLikelyToStats> playerStats,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable MostLikelyToRoundResult lastRound) implements TimedGameState {

    public MostLikelyToState {
      playerIds = frozenList(playerIds);
      pokemonPoolIds = frozenList(pokemonPoolIds);
      promptPool = frozenList(promptPool);
      usedPromptIds = frozenList(usedPromptIds);
      selections = frozenMap(selections);
      votes = frozenMap(votes);
      voteCandidates = frozenList(voteCandidates);
      voteHistory = frozenList(voteHistory);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).pokemonPoolIds(pokemonPoolIds)
          .promptPool(promptPool).usedPromptIds(usedPromptIds).roundNumber(roundNumber)
          .currentPromptId(currentPromptId).selections(selections).votes(votes).voteCandidates(voteCandidates)
          .voteRoundNumber(voteRoundNumber).voteHistory(voteHistory).scores(scores).playerStats(playerStats)
          .roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private MostLikelyToConfig config;
      private List<String> playerIds = List.of();
      private List<String> pokemonPoolIds = List.of();
      private List<SubjectiveCategory> promptPool = List.of();
      private List<String> usedPromptIds = List.of();
      private int roundNumber;
      private String currentPromptId;
      private Map<String, MostLikelyToPokemon> selections = Map.of();
      private Map<String, String> votes = Map.of();
      private List<String> voteCandidates = List.of();
      private int voteRoundNumber;
      private List<MostLikelyToVoteRound> voteHistory = List.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, MostLikelyToStats> playerStats = Map.of();
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private MostLikelyToRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(MostLikelyToConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder pokemonPoolIds(List<String> value) { pokemonPoolIds = value; return this; }

      public Builder promptPool(List<SubjectiveCategory> value) { promptPool = value; return this; }

      public Builder usedPromptIds(List<String> value) { usedPromptIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder currentPromptId(@Nullable String value) { currentPromptId = value; return this; }

      public Builder selections(Map<String, MostLikelyToPokemon> value) { selections = value; return this; }

      public Builder votes(Map<String, String> value) { votes = value; return this; }

      public Builder voteCandidates(List<String> value) { voteCandidates = value; return this; }

      public Builder voteRoundNumber(int value) { voteRoundNumber = value; return this; }

      public Builder voteHistory(List<MostLikelyToVoteRound> value) { voteHistory = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, MostLikelyToStats> value) { playerStats = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable MostLikelyToRoundResult value) { lastRound = value; return this; }

      public MostLikelyToState build() {
        return new MostLikelyToState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, pokemonPoolIds, promptPool, usedPromptIds, roundNumber, currentPromptId, selections, votes,
            voteCandidates, voteRoundNumber, voteHistory, scores, playerStats, roundEndsAt, nextTransitionAt,
            lastRound);
      }
    }
  }

  /** {@code mostLikelyToActionSchema}: unión discriminada por {@code type}, cada variante estricta (UTF-16). */
  public sealed interface MostLikelyToAction {

    record SelectPokemon(String pokemonId) implements MostLikelyToAction {}

    record VoteAnswer(String playerId) implements MostLikelyToAction {}

    static MostLikelyToAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "SELECT_POKEMON" -> {
          strict(raw, Set.of("type", "pokemonId"));
          yield new SelectPokemon(string(raw, "pokemonId", 96));
        }
        case "VOTE_ANSWER" -> {
          strict(raw, Set.of("type", "playerId"));
          yield new VoteAnswer(string(raw, "playerId", 128));
        }
        default -> throw invalid();
      };
    }

    /** {@code z.string().min(1).max(max)}. */
    private static String string(JsonNode raw, String key, int max) {
      var value = raw.get(key);
      if (value == null || !value.isString()) throw invalid();
      var text = value.getStringValue();
      if (text.isEmpty() || text.length() > max) throw invalid();
      return text;
    }

    private static void strict(JsonNode raw, Set<String> keys) {
      for (var entry : raw.entries()) {
        if (!keys.contains(entry.getKey())) throw invalid();
      }
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Most Likely To no válida.");
    }
  }

  /** {@code { playerId, pokemon }} de una respuesta revelada durante la votación. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record MostLikelyToRevealedAnswer(String playerId, MostLikelyToPokemon pokemon) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record MostLikelyToPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      String prompt,
      List<String> playerIds,
      List<String> selectionCompletedIds,
      List<MostLikelyToRevealedAnswer> revealedAnswers,
      List<String> votedPlayerIds,
      List<String> voteCandidates,
      int voteRoundNumber,
      Map<String, Integer> scores,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable MostLikelyToRoundResult lastRound,
      @Nullable GameResults results) {}

  /** Las dos variantes de TS ({@code PLAYER}/{@code SPECTATOR}) tienen las mismas claves: un único record. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record MostLikelyToPlayerState(
      String role,
      boolean canSelect,
      @Nullable MostLikelyToPokemon ownChoice,
      boolean canVote,
      @Nullable String ownVotePlayerId) {

    static final MostLikelyToPlayerState SPECTATOR = new MostLikelyToPlayerState("SPECTATOR", false, null, false, null);
  }
}

package es.pokemonuniverse.domain.game.engines.pokemonredflag;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
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
 * Tipos de {@code pokemon-red-flag/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokemonRedFlagTypes {

  private PokemonRedFlagTypes() {}

  /** {@code PokemonFlagMode}. */
  public enum PokemonFlagMode { RED, GREEN }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonRedFlagPokemon(String id, String name, String sprite) {}

  /** {@code PokemonRedFlagStats}: nueve contadores contiguos, que se derivan con métodos con nombre. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonRedFlagStats(int roundsPlayed, int answersSubmitted, int roundsMissed, int votesCast,
      int votesReceived, int roundWins, int soloWins, int sharedWins, int pointsFromRounds) {

    /** {@code emptyPokemonRedFlagStats()}. */
    public static final PokemonRedFlagStats ZERO = new PokemonRedFlagStats(0, 0, 0, 0, 0, 0, 0, 0, 0);

    PokemonRedFlagStats afterVote() {
      return new PokemonRedFlagStats(roundsPlayed, answersSubmitted, roundsMissed, votesCast + 1, votesReceived,
          roundWins, soloWins, sharedWins, pointsFromRounds);
    }

    /** Cierre de ronda de {@code finishRound}. */
    PokemonRedFlagStats afterRound(boolean answered, int receivedVotes, boolean won, int winnerCount, int points) {
      return new PokemonRedFlagStats(roundsPlayed + 1, answersSubmitted + (answered ? 1 : 0),
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
  public record PokemonRedFlagAnswer(String id, String authorId, String text) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonRedFlagVoteRound(int number, List<String> candidateIds, Map<String, String> votes) {

    public PokemonRedFlagVoteRound {
      candidateIds = frozenList(candidateIds);
      votes = frozenMap(votes);
    }

    static PokemonRedFlagVoteRound of(RunoffVoteRound round) {
      return new PokemonRedFlagVoteRound(round.number(), round.candidateIds(), round.votes());
    }
  }

  /** {@code PokemonRedFlagAnswer & { votesReceived, won }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonRedFlagResultAnswer(String id, String authorId, String text, int votesReceived, boolean won) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonRedFlagRoundResult(
      PokemonFlagMode flagMode,
      PokemonRedFlagPokemon pokemon,
      List<PokemonRedFlagResultAnswer> answers,
      List<PokemonRedFlagVoteRound> voteRounds,
      List<String> winningAnswerIds,
      List<String> winnerIds,
      Map<String, Integer> pointsAwarded,
      List<String> missingPlayerIds) {

    public PokemonRedFlagRoundResult {
      answers = frozenList(answers);
      voteRounds = frozenList(voteRounds);
      winningAnswerIds = frozenList(winningAnswerIds);
      winnerIds = frozenList(winnerIds);
      pointsAwarded = frozenMap(pointsAwarded);
      missingPlayerIds = frozenList(missingPlayerIds);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record PokemonRedFlagState(
      GamePhase phase,
      PokemonRedFlagConfig config,
      List<String> playerIds,
      List<String> pokemonDeckIds,
      int roundNumber,
      @Nullable PokemonRedFlagPokemon currentPokemon,
      PokemonFlagMode flagMode,
      Map<String, String> answerSlots,
      Map<String, String> drafts,
      Map<String, PokemonRedFlagAnswer> answers,
      List<String> answerOrder,
      Map<String, String> votes,
      List<String> voteCandidates,
      int voteRoundNumber,
      List<PokemonRedFlagVoteRound> voteHistory,
      Map<String, Integer> scores,
      Map<String, PokemonRedFlagStats> playerStats,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokemonRedFlagRoundResult lastRound) implements TimedGameState {

    public PokemonRedFlagState {
      playerIds = frozenList(playerIds);
      pokemonDeckIds = frozenList(pokemonDeckIds);
      answerSlots = frozenMap(answerSlots);
      drafts = frozenMap(drafts);
      answers = frozenMap(answers);
      answerOrder = frozenList(answerOrder);
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
      return new Builder().phase(phase).config(config).playerIds(playerIds).pokemonDeckIds(pokemonDeckIds)
          .roundNumber(roundNumber).currentPokemon(currentPokemon).flagMode(flagMode).answerSlots(answerSlots)
          .drafts(drafts).answers(answers).answerOrder(answerOrder).votes(votes).voteCandidates(voteCandidates)
          .voteRoundNumber(voteRoundNumber).voteHistory(voteHistory).scores(scores).playerStats(playerStats)
          .roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokemonRedFlagConfig config;
      private List<String> playerIds = List.of();
      private List<String> pokemonDeckIds = List.of();
      private int roundNumber;
      private PokemonRedFlagPokemon currentPokemon;
      private PokemonFlagMode flagMode;
      private Map<String, String> answerSlots = Map.of();
      private Map<String, String> drafts = Map.of();
      private Map<String, PokemonRedFlagAnswer> answers = Map.of();
      private List<String> answerOrder = List.of();
      private Map<String, String> votes = Map.of();
      private List<String> voteCandidates = List.of();
      private int voteRoundNumber;
      private List<PokemonRedFlagVoteRound> voteHistory = List.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, PokemonRedFlagStats> playerStats = Map.of();
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private PokemonRedFlagRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokemonRedFlagConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder pokemonDeckIds(List<String> value) { pokemonDeckIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder currentPokemon(@Nullable PokemonRedFlagPokemon value) { currentPokemon = value; return this; }

      public Builder flagMode(PokemonFlagMode value) { flagMode = value; return this; }

      public Builder answerSlots(Map<String, String> value) { answerSlots = value; return this; }

      public Builder drafts(Map<String, String> value) { drafts = value; return this; }

      public Builder answers(Map<String, PokemonRedFlagAnswer> value) { answers = value; return this; }

      public Builder answerOrder(List<String> value) { answerOrder = value; return this; }

      public Builder votes(Map<String, String> value) { votes = value; return this; }

      public Builder voteCandidates(List<String> value) { voteCandidates = value; return this; }

      public Builder voteRoundNumber(int value) { voteRoundNumber = value; return this; }

      public Builder voteHistory(List<PokemonRedFlagVoteRound> value) { voteHistory = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, PokemonRedFlagStats> value) { playerStats = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable PokemonRedFlagRoundResult value) { lastRound = value; return this; }

      public PokemonRedFlagState build() {
        return new PokemonRedFlagState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, pokemonDeckIds, roundNumber, currentPokemon, Objects.requireNonNull(flagMode, "flagMode"),
            answerSlots, drafts, answers, answerOrder, votes, voteCandidates, voteRoundNumber, voteHistory, scores,
            playerStats, roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /**
   * {@code pokemonRedFlagActionSchema}: unión discriminada por {@code type}, cada variante estricta. Las longitudes son
   * en unidades UTF-16 ({@code string.length}). {@code SUBMIT_RED_FLAG} recorta el texto con el {@code trim} de JS
   * ({@link JsStrings#trim}) antes de comprobar {@code min(1)}/{@code max(100)}, y la acción lleva el texto recortado;
   * el borrador no se recorta.
   */
  public sealed interface PokemonRedFlagAction {

    record UpdateDraft(String text) implements PokemonRedFlagAction {}

    record Submit(String text) implements PokemonRedFlagAction {}

    record Vote(String answerId) implements PokemonRedFlagAction {}

    static PokemonRedFlagAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "UPDATE_RED_FLAG_DRAFT" -> {
          strict(raw, Set.of("type", "text"));
          var text = string(raw, "text");
          if (text.length() > 100) throw invalid();
          yield new UpdateDraft(text);
        }
        case "SUBMIT_RED_FLAG" -> {
          strict(raw, Set.of("type", "text"));
          var text = JsStrings.trim(string(raw, "text"));
          if (text.isEmpty() || text.length() > 100) throw invalid();
          yield new Submit(text);
        }
        case "VOTE_RED_FLAG" -> {
          strict(raw, Set.of("type", "answerId"));
          var answerId = string(raw, "answerId");
          if (answerId.isEmpty() || answerId.length() > 96) throw invalid();
          yield new Vote(answerId);
        }
        default -> throw invalid();
      };
    }

    private static String string(JsonNode raw, String key) {
      var value = raw.get(key);
      if (value == null || !value.isString()) throw invalid();
      return value.getStringValue();
    }

    private static void strict(JsonNode raw, Set<String> keys) {
      for (var entry : raw.entries()) {
        if (!keys.contains(entry.getKey())) throw invalid();
      }
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de La Frase Pokémon no válida.");
    }
  }

  /** {@code { id, text }} de una respuesta revelada o propia. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonRedFlagAnswerView(String id, String text) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonRedFlagPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      @Nullable PokemonRedFlagPokemon pokemon,
      PokemonFlagMode flagMode,
      List<String> playerIds,
      List<String> submittedPlayerIds,
      List<PokemonRedFlagAnswerView> revealedAnswers,
      List<String> votedPlayerIds,
      List<String> voteCandidateIds,
      int voteRoundNumber,
      Map<String, Integer> scores,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokemonRedFlagRoundResult lastRound,
      @Nullable GameResults results) {}

  /** Las dos variantes de TS ({@code PLAYER}/{@code SPECTATOR}) tienen las mismas claves: un único record. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonRedFlagPlayerState(
      String role,
      boolean canSubmit,
      String ownDraft,
      @Nullable PokemonRedFlagAnswerView ownAnswer,
      boolean canVote,
      @Nullable String ownVoteAnswerId,
      @Nullable String ownAnswerId) {

    static final PokemonRedFlagPlayerState SPECTATOR =
        new PokemonRedFlagPlayerState("SPECTATOR", false, "", null, false, null, null);
  }
}

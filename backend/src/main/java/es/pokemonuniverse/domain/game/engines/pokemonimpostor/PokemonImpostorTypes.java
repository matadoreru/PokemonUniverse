package es.pokemonuniverse.domain.game.engines.pokemonimpostor;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenSortedMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.SortedMap;
import java.util.TreeMap;

/**
 * Estado, acciones y proyecciones; las proyecciones tienen su tipo TS en {@code pokemon-impostor/types.ts}.
 * Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); {@code clues} es un {@code Record<number, …>} ({@code Immutables.frozenSortedMap}).
 * Cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokemonImpostorTypes {

  private PokemonImpostorTypes() {}

  /** {@code ImpostorRole}. */
  public enum ImpostorRole { INNOCENT, IMPOSTOR }

  /** {@code ImpostorWinner}. */
  public enum ImpostorWinner { INNOCENTS, IMPOSTORS }

  /** {@code ImpostorClue.status}. */
  public enum ClueStatus { SUBMITTED, TIMEOUT, DISCONNECTED }

  /** {@code ImpostorFinishReason}: motivo del final de la partida. */
  public enum ImpostorFinishReason { GUESS, PARITY, IMPOSTORS_ELIMINATED, STALEMATE }

  /** {@code IMPOSTOR_SKIP_TARGET}: el {@code targetId} de un voto a «Saltar». */
  public static final String IMPOSTOR_SKIP_TARGET = "SKIP";

  /** {@code ImpostorVoteResult.kind}. */
  public enum VoteResultKind { TIE, ELIMINATION, SKIPPED, DEADLOCK }

  /** Pista enviada o turno saltado ({@code text} y {@code submittedAt} nulos). */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ImpostorClue(@Nullable String text, @Nullable Long submittedAt, ClueStatus status) {

    static ImpostorClue submitted(String text, long submittedAt) {
      return new ImpostorClue(text, submittedAt, ClueStatus.SUBMITTED);
    }

    static ImpostorClue skipped(ClueStatus status) {
      return new ImpostorClue(null, null, status);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ImpostorGuess(String pokemonId, boolean correct, long guessedAt) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ImpostorVote(String targetId, long votedAt) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ImpostorVoteResult(VoteResultKind kind, Map<String, ImpostorVote> votes, Map<String, Integer> tallies,
      int skipVotes, List<String> tiedIds, @Nullable String eliminatedId) {

    public ImpostorVoteResult {
      votes = frozenMap(votes);
      tallies = frozenMap(tallies);
      tiedIds = frozenList(tiedIds);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ImpostorEliminationReveal(String playerId, ImpostorRole role) {}

  /** {@code ImpostorPlayerStats}: dos contadores contiguos, que se derivan con métodos con nombre. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ImpostorPlayerStats(int cluesSubmitted, int votesCast) {

    /** {@code { cluesSubmitted: 0, votesCast: 0 }}. */
    public static final ImpostorPlayerStats ZERO = new ImpostorPlayerStats(0, 0);

    ImpostorPlayerStats afterClue() {
      return new ImpostorPlayerStats(cluesSubmitted + 1, votesCast);
    }

    ImpostorPlayerStats afterVote() {
      return new ImpostorPlayerStats(cluesSubmitted, votesCast + 1);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record PokemonImpostorState(
      GamePhase phase,
      PokemonImpostorConfig config,
      List<String> playerIds,
      Map<String, ImpostorRole> roles,
      String secretPokemonId,
      List<String> aliveIds,
      List<String> eliminatedIds,
      List<String> spectatorIds,
      int roundNumber,
      SortedMap<Integer, Map<String, ImpostorClue>> clues,
      List<String> clueOrder,
      int currentClueTurnIndex,
      Map<String, ImpostorGuess> guessAttempts,
      Map<String, ImpostorVote> votes,
      List<String> voteCandidateIds,
      int votingRound,
      int roundsWithoutElimination,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable ImpostorVoteResult lastVoteResult,
      @Nullable ImpostorEliminationReveal eliminationReveal,
      @Nullable ImpostorWinner winnerTeam,
      @Nullable ImpostorFinishReason finishReason,
      Map<String, ImpostorPlayerStats> playerStats,
      int clueLap) implements TimedGameState {

    public PokemonImpostorState {
      playerIds = frozenList(playerIds);
      roles = frozenMap(roles);
      aliveIds = frozenList(aliveIds);
      eliminatedIds = frozenList(eliminatedIds);
      spectatorIds = frozenList(spectatorIds);
      var frozenClues = new LinkedHashMap<Integer, Map<String, ImpostorClue>>();
      clues.forEach((round, roundClues) -> frozenClues.put(round, frozenMap(roundClues)));
      clues = frozenSortedMap(frozenClues);
      clueOrder = frozenList(clueOrder);
      guessAttempts = frozenMap(guessAttempts);
      votes = frozenMap(votes);
      voteCandidateIds = frozenList(voteCandidateIds);
      playerStats = frozenMap(playerStats);
    }

    /** {@code state.clues[state.roundNumber] ?? {}}. */
    Map<String, ImpostorClue> roundClues() {
      var roundClues = clues.get(roundNumber);
      return roundClues == null ? Map.of() : roundClues;
    }

    /** {@code state.clueOrder[state.currentClueTurnIndex]}, o {@code null} fuera de rango ({@code undefined}). */
    @Nullable String currentCluePlayerId() {
      return currentClueTurnIndex >= 0 && currentClueTurnIndex < clueOrder.size()
          ? clueOrder.get(currentClueTurnIndex)
          : null;
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).roles(roles)
          .secretPokemonId(secretPokemonId).aliveIds(aliveIds).eliminatedIds(eliminatedIds)
          .spectatorIds(spectatorIds).roundNumber(roundNumber).clues(clues).clueOrder(clueOrder)
          .currentClueTurnIndex(currentClueTurnIndex).guessAttempts(guessAttempts).votes(votes)
          .voteCandidateIds(voteCandidateIds).votingRound(votingRound)
          .roundsWithoutElimination(roundsWithoutElimination).roundStartedAt(roundStartedAt)
          .roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).lastVoteResult(lastVoteResult)
          .eliminationReveal(eliminationReveal).winnerTeam(winnerTeam).finishReason(finishReason)
          .playerStats(playerStats).clueLap(clueLap);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokemonImpostorConfig config;
      private List<String> playerIds = List.of();
      private Map<String, ImpostorRole> roles = Map.of();
      private String secretPokemonId;
      private List<String> aliveIds = List.of();
      private List<String> eliminatedIds = List.of();
      private List<String> spectatorIds = List.of();
      private int roundNumber;
      private Map<Integer, Map<String, ImpostorClue>> clues = Map.of();
      private List<String> clueOrder = List.of();
      private int currentClueTurnIndex;
      private Map<String, ImpostorGuess> guessAttempts = Map.of();
      private Map<String, ImpostorVote> votes = Map.of();
      private List<String> voteCandidateIds = List.of();
      private int votingRound;
      private int roundsWithoutElimination;
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private ImpostorVoteResult lastVoteResult;
      private ImpostorEliminationReveal eliminationReveal;
      private ImpostorWinner winnerTeam;
      private ImpostorFinishReason finishReason;
      private Map<String, ImpostorPlayerStats> playerStats = Map.of();
      private int clueLap;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokemonImpostorConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder roles(Map<String, ImpostorRole> value) { roles = value; return this; }

      public Builder secretPokemonId(String value) { secretPokemonId = value; return this; }

      public Builder aliveIds(List<String> value) { aliveIds = value; return this; }

      public Builder eliminatedIds(List<String> value) { eliminatedIds = value; return this; }

      public Builder spectatorIds(List<String> value) { spectatorIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder clues(Map<Integer, Map<String, ImpostorClue>> value) { clues = value; return this; }

      public Builder clueOrder(List<String> value) { clueOrder = value; return this; }

      public Builder currentClueTurnIndex(int value) { currentClueTurnIndex = value; return this; }

      public Builder guessAttempts(Map<String, ImpostorGuess> value) { guessAttempts = value; return this; }

      public Builder votes(Map<String, ImpostorVote> value) { votes = value; return this; }

      public Builder voteCandidateIds(List<String> value) { voteCandidateIds = value; return this; }

      public Builder votingRound(int value) { votingRound = value; return this; }

      public Builder roundsWithoutElimination(int value) { roundsWithoutElimination = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastVoteResult(@Nullable ImpostorVoteResult value) { lastVoteResult = value; return this; }

      public Builder eliminationReveal(@Nullable ImpostorEliminationReveal value) {
        eliminationReveal = value;
        return this;
      }

      public Builder winnerTeam(@Nullable ImpostorWinner value) { winnerTeam = value; return this; }

      public Builder finishReason(@Nullable ImpostorFinishReason value) { finishReason = value; return this; }

      public Builder playerStats(Map<String, ImpostorPlayerStats> value) { playerStats = value; return this; }

      /** Vuelta de pistas en curso (1 o 2) en {@code ONE_WORD}; 0 en Clásico, donde cada ronda tiene una sola. */
      public Builder clueLap(int value) { clueLap = value; return this; }

      public PokemonImpostorState build() {
        return new PokemonImpostorState(Objects.requireNonNull(phase, "phase"),
            Objects.requireNonNull(config, "config"), playerIds, roles,
            Objects.requireNonNull(secretPokemonId, "secretPokemonId"), aliveIds, eliminatedIds, spectatorIds,
            roundNumber, new TreeMap<>(clues), clueOrder, currentClueTurnIndex, guessAttempts, votes,
            voteCandidateIds, votingRound, roundsWithoutElimination, roundStartedAt, roundEndsAt, nextTransitionAt,
            lastVoteResult, eliminationReveal, winnerTeam, finishReason, playerStats, clueLap);
      }
    }
  }

  /** {@code pokemonImpostorActionSchema}: unión discriminada por {@code type}, cada variante estricta (UTF-16). */
  public sealed interface PokemonImpostorAction {

    /** {@code text} admite la cadena vacía ({@code z.string().max(200)}); la pista se valida en el motor. */
    record SubmitClue(String text) implements PokemonImpostorAction {}

    record Vote(String targetId) implements PokemonImpostorAction {}

    record GuessPokemon(String pokemonId) implements PokemonImpostorAction {}

    static PokemonImpostorAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "SUBMIT_CLUE" -> {
          strict(raw, Set.of("type", "text"));
          yield new SubmitClue(string(raw, "text", 0, 200));
        }
        case "VOTE" -> {
          strict(raw, Set.of("type", "targetId"));
          yield new Vote(string(raw, "targetId", 1, 64));
        }
        case "GUESS_POKEMON" -> {
          strict(raw, Set.of("type", "pokemonId"));
          yield new GuessPokemon(string(raw, "pokemonId", 1, 64));
        }
        default -> throw invalid();
      };
    }

    /** {@code z.string().min(min).max(max)}, en unidades UTF-16 como {@code String.length}. */
    private static String string(JsonNode raw, String key, int min, int max) {
      var value = raw.get(key);
      if (value == null || !value.isString()) throw invalid();
      var text = value.getStringValue();
      if (text.length() < min || text.length() > max) throw invalid();
      return text;
    }

    private static void strict(JsonNode raw, Set<String> keys) {
      for (var entry : raw.entries()) {
        if (!keys.contains(entry.getKey())) throw invalid();
      }
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Pokémon Impostor no válida.");
    }
  }

  /** {@code { name, sprite }} del Pokémon secreto. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SecretPokemon(String name, String sprite) {}

  /** Proyección pública; se construye con {@link #builder()}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonImpostorPublicState(
      String gameId,
      GamePhase phase,
      PokemonImpostorMode mode,
      List<String> playerIds,
      List<String> aliveIds,
      List<String> eliminatedIds,
      List<String> spectatorIds,
      int roundNumber,
      SortedMap<Integer, Map<String, ImpostorClue>> clues,
      List<String> clueOrder,
      int currentClueTurnIndex,
      @Nullable String currentCluePlayerId,
      List<String> cluePendingIds,
      List<String> voteCompletedIds,
      List<String> voteCandidateIds,
      int votingRound,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable ImpostorVoteResult lastVoteResult,
      @Nullable ImpostorEliminationReveal eliminationReveal,
      @Nullable ImpostorWinner winnerTeam,
      @Nullable ImpostorFinishReason finishReason,
      @Nullable GameResults results,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Integer clueLap) {

    public static Builder builder() {
      return new Builder();
    }

    public static final class Builder {
      private String gameId;
      private GamePhase phase;
      private PokemonImpostorMode mode = PokemonImpostorMode.CLASSIC;
      private List<String> playerIds = List.of();
      private List<String> aliveIds = List.of();
      private List<String> eliminatedIds = List.of();
      private List<String> spectatorIds = List.of();
      private int roundNumber;
      private SortedMap<Integer, Map<String, ImpostorClue>> clues = frozenSortedMap(Map.of());
      private List<String> clueOrder = List.of();
      private int currentClueTurnIndex;
      private String currentCluePlayerId;
      private List<String> cluePendingIds = List.of();
      private List<String> voteCompletedIds = List.of();
      private List<String> voteCandidateIds = List.of();
      private int votingRound;
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private ImpostorVoteResult lastVoteResult;
      private ImpostorEliminationReveal eliminationReveal;
      private ImpostorWinner winnerTeam;
      private ImpostorFinishReason finishReason;
      private GameResults results;
      private Integer clueLap;

      private Builder() {}

      public Builder gameId(String value) { gameId = value; return this; }

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder aliveIds(List<String> value) { aliveIds = value; return this; }

      public Builder eliminatedIds(List<String> value) { eliminatedIds = value; return this; }

      public Builder spectatorIds(List<String> value) { spectatorIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder clues(SortedMap<Integer, Map<String, ImpostorClue>> value) { clues = value; return this; }

      public Builder clueOrder(List<String> value) { clueOrder = value; return this; }

      public Builder currentClueTurnIndex(int value) { currentClueTurnIndex = value; return this; }

      public Builder currentCluePlayerId(@Nullable String value) { currentCluePlayerId = value; return this; }

      public Builder cluePendingIds(List<String> value) { cluePendingIds = value; return this; }

      public Builder voteCompletedIds(List<String> value) { voteCompletedIds = value; return this; }

      public Builder voteCandidateIds(List<String> value) { voteCandidateIds = value; return this; }

      public Builder votingRound(int value) { votingRound = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastVoteResult(@Nullable ImpostorVoteResult value) { lastVoteResult = value; return this; }

      public Builder eliminationReveal(@Nullable ImpostorEliminationReveal value) {
        eliminationReveal = value;
        return this;
      }

      public Builder winnerTeam(@Nullable ImpostorWinner value) { winnerTeam = value; return this; }

      public Builder finishReason(@Nullable ImpostorFinishReason value) { finishReason = value; return this; }

      public Builder results(@Nullable GameResults value) { results = value; return this; }

      public Builder mode(PokemonImpostorMode value) { mode = value; return this; }

      /** Solo en {@code ONE_WORD}: la vuelta de pistas (1 o 2); ausente en Clásico. */
      public Builder clueLap(@Nullable Integer value) { clueLap = value; return this; }

      public PokemonImpostorPublicState build() {
        return new PokemonImpostorPublicState(Objects.requireNonNull(gameId, "gameId"),
            Objects.requireNonNull(phase, "phase"), mode, playerIds, aliveIds, eliminatedIds, spectatorIds,
            roundNumber, clues, clueOrder, currentClueTurnIndex, currentCluePlayerId, cluePendingIds,
            voteCompletedIds, voteCandidateIds, votingRound, roundStartedAt, roundEndsAt, nextTransitionAt,
            lastVoteResult, eliminationReveal, winnerTeam, finishReason, results, clueLap);
      }
    }
  }

  /**
   * Proyección de un jugador: el impostor no ve el Pokémon secreto hasta que lo expulsan o termina la partida; un
   * identificador ajeno a la partida recibe {@code role: null}. Se construye con {@link #builder()}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonImpostorPlayerState(
      @Nullable ImpostorRole role,
      @Nullable SecretPokemon secretPokemon,
      @Nullable Map<String, ImpostorRole> revealedRoles,
      @JsonInclude(JsonInclude.Include.NON_NULL) @Nullable List<String> fellowImpostorIds,
      boolean alive,
      boolean canSubmitClue,
      @Nullable ImpostorClue ownClue,
      boolean canGuessPokemon,
      boolean guessUsed,
      @Nullable Boolean guessCorrect,
      boolean canVote,
      @Nullable ImpostorVote ownVote) {

    public static Builder builder() {
      return new Builder();
    }

    public static final class Builder {
      private ImpostorRole role;
      private SecretPokemon secretPokemon;
      private Map<String, ImpostorRole> revealedRoles;
      private List<String> fellowImpostorIds;
      private boolean alive;
      private boolean canSubmitClue;
      private ImpostorClue ownClue;
      private boolean canGuessPokemon;
      private boolean guessUsed;
      private Boolean guessCorrect;
      private boolean canVote;
      private ImpostorVote ownVote;

      private Builder() {}

      public Builder role(@Nullable ImpostorRole value) { role = value; return this; }

      public Builder secretPokemon(@Nullable SecretPokemon value) { secretPokemon = value; return this; }

      public Builder revealedRoles(@Nullable Map<String, ImpostorRole> value) { revealedRoles = value; return this; }

      public Builder fellowImpostorIds(@Nullable List<String> value) { fellowImpostorIds = value; return this; }

      public Builder alive(boolean value) { alive = value; return this; }

      public Builder canSubmitClue(boolean value) { canSubmitClue = value; return this; }

      public Builder ownClue(@Nullable ImpostorClue value) { ownClue = value; return this; }

      public Builder canGuessPokemon(boolean value) { canGuessPokemon = value; return this; }

      public Builder guessUsed(boolean value) { guessUsed = value; return this; }

      public Builder guessCorrect(@Nullable Boolean value) { guessCorrect = value; return this; }

      public Builder canVote(boolean value) { canVote = value; return this; }

      public Builder ownVote(@Nullable ImpostorVote value) { ownVote = value; return this; }

      public PokemonImpostorPlayerState build() {
        return new PokemonImpostorPlayerState(role, secretPokemon,
            revealedRoles == null ? null : frozenMap(revealedRoles),
            fellowImpostorIds == null ? null : frozenList(fellowImpostorIds), alive, canSubmitClue, ownClue, canGuessPokemon,
            guessUsed, guessCorrect, canVote, ownVote);
      }
    }
  }
}

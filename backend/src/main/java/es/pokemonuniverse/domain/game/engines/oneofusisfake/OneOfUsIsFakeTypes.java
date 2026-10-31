package es.pokemonuniverse.domain.game.engines.oneofusisfake;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
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
 * Tipos de {@code one-of-us-is-fake/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class OneOfUsIsFakeTypes {

  private OneOfUsIsFakeTypes() {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record FakePokemonChoice(String id, String name, String sprite) {}

  /** {@code OneOfUsIsFakeStats}: nueve contadores contiguos, que se derivan con métodos con nombre. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OneOfUsIsFakeStats(int roundsPlayed, int victoriesAsFake, int victoriesAsNormal, int timesFake,
      int fakeDiscovered, int fakeUndiscovered, int correctVotes, int incorrectVotes, int normalWronglySelected) {

    /** {@code emptyOneOfUsIsFakeStats()}. */
    public static final OneOfUsIsFakeStats ZERO = new OneOfUsIsFakeStats(0, 0, 0, 0, 0, 0, 0, 0, 0);

    /** {@code victoriesAsFake + victoriesAsNormal}, segundo criterio de la clasificación. */
    int victories() {
      return victoriesAsFake + victoriesAsNormal;
    }

    /** Al empezar la ronda como fake. */
    OneOfUsIsFakeStats asFake() {
      return new OneOfUsIsFakeStats(roundsPlayed, victoriesAsFake, victoriesAsNormal, timesFake + 1, fakeDiscovered,
          fakeUndiscovered, correctVotes, incorrectVotes, normalWronglySelected);
    }

    /** Un voto: correcto si apunta al fake. */
    OneOfUsIsFakeStats afterVote(boolean correct) {
      return new OneOfUsIsFakeStats(roundsPlayed, victoriesAsFake, victoriesAsNormal, timesFake, fakeDiscovered,
          fakeUndiscovered, correctVotes + (correct ? 1 : 0), incorrectVotes + (correct ? 0 : 1),
          normalWronglySelected);
    }

    /** Cierre de ronda de {@code finishRound}. */
    OneOfUsIsFakeStats afterRound(boolean isFake, boolean normalsWin, boolean selected) {
      return new OneOfUsIsFakeStats(roundsPlayed + 1, victoriesAsFake + (isFake && !normalsWin ? 1 : 0),
          victoriesAsNormal + (!isFake && normalsWin ? 1 : 0), timesFake,
          fakeDiscovered + (isFake && normalsWin ? 1 : 0), fakeUndiscovered + (isFake && !normalsWin ? 1 : 0),
          correctVotes, incorrectVotes, normalWronglySelected + (!isFake && selected ? 1 : 0));
    }

    /** {@code { ...stats }} para la clasificación, en el orden de claves de TS. */
    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("roundsPlayed", roundsPlayed);
      mapped.put("victoriesAsFake", victoriesAsFake);
      mapped.put("victoriesAsNormal", victoriesAsNormal);
      mapped.put("timesFake", timesFake);
      mapped.put("fakeDiscovered", fakeDiscovered);
      mapped.put("fakeUndiscovered", fakeUndiscovered);
      mapped.put("correctVotes", correctVotes);
      mapped.put("incorrectVotes", incorrectVotes);
      mapped.put("normalWronglySelected", normalWronglySelected);
      return mapped;
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record FakeVoteRound(int number, List<String> candidateIds, Map<String, String> votes) {

    public FakeVoteRound {
      candidateIds = frozenList(candidateIds);
      votes = frozenMap(votes);
    }
  }

  /** {@code FakeRoundResult.winner}. */
  public enum FakeWinner { NORMALS, FAKE }

  /** Jugador de {@code lastRound.players}: {@code { playerId, category, pokemon, isFake }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record FakeRoundPlayer(String playerId, String category, @Nullable FakePokemonChoice pokemon,
      boolean isFake) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record FakeRoundResult(
      String fakePlayerId,
      String selectedPlayerId,
      FakeWinner winner,
      String mainCategory,
      String fakeCategory,
      List<FakeRoundPlayer> players,
      List<FakeVoteRound> voteRounds,
      Map<String, Integer> pointsAwarded) {

    public FakeRoundResult {
      players = frozenList(players);
      voteRounds = frozenList(voteRounds);
      pointsAwarded = frozenMap(pointsAwarded);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record OneOfUsIsFakeState(
      GamePhase phase,
      OneOfUsIsFakeConfig config,
      List<String> playerIds,
      List<String> poolIds,
      List<SubjectiveCategory> categoryPool,
      List<String> usedCategoryIds,
      int roundNumber,
      @Nullable String fakePlayerId,
      @Nullable String mainCategoryId,
      @Nullable String fakeCategoryId,
      Map<String, FakePokemonChoice> selections,
      List<String> revealOrder,
      int revealedCount,
      Map<String, String> votes,
      List<String> voteCandidates,
      int voteRoundNumber,
      List<FakeVoteRound> voteHistory,
      Map<String, Integer> scores,
      Map<String, OneOfUsIsFakeStats> playerStats,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable FakeRoundResult lastRound) implements TimedGameState {

    public OneOfUsIsFakeState {
      playerIds = frozenList(playerIds);
      poolIds = frozenList(poolIds);
      categoryPool = frozenList(categoryPool);
      usedCategoryIds = frozenList(usedCategoryIds);
      selections = frozenMap(selections);
      revealOrder = frozenList(revealOrder);
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
      return new Builder().phase(phase).config(config).playerIds(playerIds).poolIds(poolIds).categoryPool(categoryPool)
          .usedCategoryIds(usedCategoryIds).roundNumber(roundNumber).fakePlayerId(fakePlayerId)
          .mainCategoryId(mainCategoryId).fakeCategoryId(fakeCategoryId).selections(selections)
          .revealOrder(revealOrder).revealedCount(revealedCount).votes(votes).voteCandidates(voteCandidates)
          .voteRoundNumber(voteRoundNumber).voteHistory(voteHistory).scores(scores).playerStats(playerStats)
          .roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private OneOfUsIsFakeConfig config;
      private List<String> playerIds = List.of();
      private List<String> poolIds = List.of();
      private List<SubjectiveCategory> categoryPool = List.of();
      private List<String> usedCategoryIds = List.of();
      private int roundNumber;
      private String fakePlayerId;
      private String mainCategoryId;
      private String fakeCategoryId;
      private Map<String, FakePokemonChoice> selections = Map.of();
      private List<String> revealOrder = List.of();
      private int revealedCount;
      private Map<String, String> votes = Map.of();
      private List<String> voteCandidates = List.of();
      private int voteRoundNumber;
      private List<FakeVoteRound> voteHistory = List.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, OneOfUsIsFakeStats> playerStats = Map.of();
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private FakeRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(OneOfUsIsFakeConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder categoryPool(List<SubjectiveCategory> value) { categoryPool = value; return this; }

      public Builder usedCategoryIds(List<String> value) { usedCategoryIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder fakePlayerId(@Nullable String value) { fakePlayerId = value; return this; }

      public Builder mainCategoryId(@Nullable String value) { mainCategoryId = value; return this; }

      public Builder fakeCategoryId(@Nullable String value) { fakeCategoryId = value; return this; }

      public Builder selections(Map<String, FakePokemonChoice> value) { selections = value; return this; }

      public Builder revealOrder(List<String> value) { revealOrder = value; return this; }

      public Builder revealedCount(int value) { revealedCount = value; return this; }

      public Builder votes(Map<String, String> value) { votes = value; return this; }

      public Builder voteCandidates(List<String> value) { voteCandidates = value; return this; }

      public Builder voteRoundNumber(int value) { voteRoundNumber = value; return this; }

      public Builder voteHistory(List<FakeVoteRound> value) { voteHistory = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, OneOfUsIsFakeStats> value) { playerStats = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable FakeRoundResult value) { lastRound = value; return this; }

      public OneOfUsIsFakeState build() {
        return new OneOfUsIsFakeState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, poolIds, categoryPool, usedCategoryIds, roundNumber, fakePlayerId, mainCategoryId,
            fakeCategoryId, selections, revealOrder, revealedCount, votes, voteCandidates, voteRoundNumber,
            voteHistory, scores, playerStats, roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /** {@code oneOfUsIsFakeActionSchema}: unión discriminada por {@code type}, cada variante estricta (UTF-16). */
  public sealed interface OneOfUsIsFakeAction {

    record SelectPokemon(String pokemonId) implements OneOfUsIsFakeAction {}

    record VotePlayer(String playerId) implements OneOfUsIsFakeAction {}

    static OneOfUsIsFakeAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "SELECT_POKEMON" -> {
          strict(raw, Set.of("type", "pokemonId"));
          yield new SelectPokemon(string(raw, "pokemonId", 96));
        }
        case "VOTE_PLAYER" -> {
          strict(raw, Set.of("type", "playerId"));
          yield new VotePlayer(string(raw, "playerId", 128));
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
      return new ConfigValidationException("Acción de One of Us Is Fake no válida.");
    }
  }

  /** {@code { playerId, pokemon }} de una elección ya revelada. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record FakeRevealedChoice(String playerId, FakePokemonChoice pokemon) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OneOfUsIsFakePublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      List<String> playerIds,
      List<String> selectionCompletedIds,
      List<FakeRevealedChoice> revealedChoices,
      List<String> votedPlayerIds,
      List<String> voteCandidates,
      int voteRoundNumber,
      Map<String, Integer> scores,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable FakeRoundResult lastRound,
      @Nullable GameResults results) {}

  /** {@code { role: 'SPECTATOR' }}: sin más claves, a diferencia de la variante de jugador. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OneOfUsIsFakeSpectatorState(String role) {

    static final OneOfUsIsFakeSpectatorState INSTANCE = new OneOfUsIsFakeSpectatorState("SPECTATOR");
  }

  /**
   * Variante {@code PLAYER}: {@code { ...base, isFake: true }} añade {@code isFake} al final, y solo si el fake lo
   * sabe; en el resto de casos la clave no existe ({@code NON_NULL}).
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record OneOfUsIsFakePlayerState(
      String role,
      String myCategory,
      @Nullable FakePokemonChoice ownChoice,
      boolean canSelect,
      boolean canVote,
      @Nullable String ownVotePlayerId,
      @JsonInclude(JsonInclude.Include.NON_NULL) @Nullable Boolean isFake) {}
}

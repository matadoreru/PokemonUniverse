package es.pokemonuniverse.domain.game.engines.pokemonconnections;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engines.pokemonconnections.PokemonConnectionsCatalog.CategoryDefinition;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code pokemon-connections/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}. Los estados
 * de jugador ({@code ConnectionPlayerStatus}) son {@code PLAYING}, {@code SOLVED}, {@code ELIMINATED} y
 * {@code TIMED_OUT}.
 */
public final class PokemonConnectionsTypes {

  static final String PLAYING = "PLAYING";
  static final String SOLVED = "SOLVED";
  static final String ELIMINATED = "ELIMINATED";
  static final String TIMED_OUT = "TIMED_OUT";

  private PokemonConnectionsTypes() {}

  /** {@code ConnectionPokemon}: tres textos contiguos, que se construyen con {@link #of}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ConnectionPokemon(String id, String name, String sprite) {

    /** {@code ({ id, name, sprite }) => ({ id, name, sprite })}. */
    static ConnectionPokemon of(Pokemon pokemon) {
      return new ConnectionPokemon(pokemon.id(), pokemon.name(), pokemon.sprite());
    }
  }

  /** {@code ConnectionAnswerGroup}: cuatro textos contiguos, que se construyen con {@link #of}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ConnectionAnswerGroup(String id, String categoryId, String label, String explanation,
      List<ConnectionPokemon> pokemon) {

    public ConnectionAnswerGroup {
      pokemon = frozenList(pokemon);
    }

    /** {@code answerGroup(definition, pokemon, index)}: el id es {@code group-<index + 1>}. */
    static ConnectionAnswerGroup of(CategoryDefinition definition, int index, List<ConnectionPokemon> pokemon) {
      return new ConnectionAnswerGroup("group-" + (index + 1), definition.id(), definition.label(),
          definition.explanation(), pokemon);
    }
  }

  /** {@code ConnectionAttemptFeedback}; {@code kind} es {@code CORRECT} o {@code INCORRECT}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ConnectionAttemptFeedback(String kind, List<String> attemptedPokemonIds, boolean nearMiss,
      long attemptedAt) {

    public ConnectionAttemptFeedback {
      attemptedPokemonIds = frozenList(attemptedPokemonIds);
    }

    static ConnectionAttemptFeedback correct(List<String> attemptedPokemonIds, long attemptedAt) {
      return new ConnectionAttemptFeedback("CORRECT", attemptedPokemonIds, false, attemptedAt);
    }

    static ConnectionAttemptFeedback incorrect(List<String> attemptedPokemonIds, boolean nearMiss, long attemptedAt) {
      return new ConnectionAttemptFeedback("INCORRECT", attemptedPokemonIds, nearMiss, attemptedAt);
    }
  }

  /** {@code PokemonConnectionsProgress}; se construye con {@link #builder()} o {@link #toBuilder()}. */
  public record PokemonConnectionsProgress(List<String> foundGroupIds, int mistakesUsed, String status,
      @Nullable Long completedAt, @Nullable Integer completionRank, int roundPoints,
      @Nullable ConnectionAttemptFeedback lastAttempt) {

    /** {@code emptyProgress()}. */
    static final PokemonConnectionsProgress EMPTY = new Builder().build();

    public PokemonConnectionsProgress {
      foundGroupIds = frozenList(foundGroupIds);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().foundGroupIds(foundGroupIds).mistakesUsed(mistakesUsed).status(status)
          .completedAt(completedAt).completionRank(completionRank).roundPoints(roundPoints).lastAttempt(lastAttempt);
    }

    /** Valores de {@code emptyProgress()} por defecto. */
    public static final class Builder {
      private List<String> foundGroupIds = List.of();
      private int mistakesUsed;
      private String status = PLAYING;
      private Long completedAt;
      private Integer completionRank;
      private int roundPoints;
      private ConnectionAttemptFeedback lastAttempt;

      private Builder() {}

      public Builder foundGroupIds(List<String> value) { foundGroupIds = value; return this; }

      public Builder mistakesUsed(int value) { mistakesUsed = value; return this; }

      public Builder status(String value) { status = value; return this; }

      public Builder completedAt(@Nullable Long value) { completedAt = value; return this; }

      public Builder completionRank(@Nullable Integer value) { completionRank = value; return this; }

      public Builder roundPoints(int value) { roundPoints = value; return this; }

      public Builder lastAttempt(@Nullable ConnectionAttemptFeedback value) { lastAttempt = value; return this; }

      public PokemonConnectionsProgress build() {
        return new PokemonConnectionsProgress(foundGroupIds, mistakesUsed, Objects.requireNonNull(status, "status"),
            completedAt, completionRank, roundPoints, lastAttempt);
      }
    }
  }

  /**
   * {@code PokemonConnectionsStats}: ocho contadores contiguos, que se derivan de {@link #EMPTY} con métodos con
   * nombre sobre el {@link Builder} (nunca por posición). El orden de {@link #toMap()} es el de
   * {@code emptyPokemonConnectionsStats()}.
   */
  public record PokemonConnectionsStats(int roundsPlayed, int groupsFound, int boardsSolved, int mistakes,
      int nearMisses, int podiumFinishes, long solveTimeTotalMs, long bestSolveTimeMs) {

    /** {@code emptyPokemonConnectionsStats()}. */
    static final PokemonConnectionsStats EMPTY = builder().build();

    /** Un grupo acertado. */
    PokemonConnectionsStats afterGroupFound() {
      return toBuilder().groupsFound(groupsFound + 1).build();
    }

    /** Un intento fallido, a una del grupo o no. */
    PokemonConnectionsStats afterMistake(boolean nearMiss) {
      return toBuilder().mistakes(mistakes + 1).nearMisses(nearMisses + (nearMiss ? 1 : 0)).build();
    }

    /** El cierre de ronda de {@code finishRound}; {@code elapsedMs} es 0 si no completó el tablero. */
    PokemonConnectionsStats afterRound(boolean solved, boolean podium, long elapsedMs) {
      long best = elapsedMs > 0 && (bestSolveTimeMs == 0 || elapsedMs < bestSolveTimeMs) ? elapsedMs : bestSolveTimeMs;
      return toBuilder()
          .roundsPlayed(roundsPlayed + 1)
          .boardsSolved(boardsSolved + (solved ? 1 : 0))
          .podiumFinishes(podiumFinishes + (podium ? 1 : 0))
          .solveTimeTotalMs(solveTimeTotalMs + elapsedMs)
          .bestSolveTimeMs(best)
          .build();
    }

    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("roundsPlayed", roundsPlayed);
      mapped.put("groupsFound", groupsFound);
      mapped.put("boardsSolved", boardsSolved);
      mapped.put("mistakes", mistakes);
      mapped.put("nearMisses", nearMisses);
      mapped.put("podiumFinishes", podiumFinishes);
      mapped.put("solveTimeTotalMs", solveTimeTotalMs);
      mapped.put("bestSolveTimeMs", bestSolveTimeMs);
      return mapped;
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return builder()
          .roundsPlayed(roundsPlayed)
          .groupsFound(groupsFound)
          .boardsSolved(boardsSolved)
          .mistakes(mistakes)
          .nearMisses(nearMisses)
          .podiumFinishes(podiumFinishes)
          .solveTimeTotalMs(solveTimeTotalMs)
          .bestSolveTimeMs(bestSolveTimeMs);
    }

    /** Setters con nombre: el constructor posicional no se usa fuera de {@link #build()}. */
    public static final class Builder {
      private int roundsPlayed;
      private int groupsFound;
      private int boardsSolved;
      private int mistakes;
      private int nearMisses;
      private int podiumFinishes;
      private long solveTimeTotalMs;
      private long bestSolveTimeMs;

      private Builder() {}

      public Builder roundsPlayed(int value) { roundsPlayed = value; return this; }

      public Builder groupsFound(int value) { groupsFound = value; return this; }

      public Builder boardsSolved(int value) { boardsSolved = value; return this; }

      public Builder mistakes(int value) { mistakes = value; return this; }

      public Builder nearMisses(int value) { nearMisses = value; return this; }

      public Builder podiumFinishes(int value) { podiumFinishes = value; return this; }

      public Builder solveTimeTotalMs(long value) { solveTimeTotalMs = value; return this; }

      public Builder bestSolveTimeMs(long value) { bestSolveTimeMs = value; return this; }

      public PokemonConnectionsStats build() {
        return new PokemonConnectionsStats(roundsPlayed, groupsFound, boardsSolved, mistakes, nearMisses,
            podiumFinishes, solveTimeTotalMs, bestSolveTimeMs);
      }
    }
  }

  /** Entrada de {@code PokemonConnectionsRoundResult.players}; se construye con {@link #of}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record RoundPlayerResult(String status, int foundGroups, List<String> foundGroupIds, int mistakesUsed,
      @Nullable Integer completionRank, @Nullable Long elapsedMs, int pointsAwarded) {

    public RoundPlayerResult {
      foundGroupIds = frozenList(foundGroupIds);
    }

    /** El resultado de un progreso ya cerrado; {@code elapsedMs} es nulo si no completó el tablero. */
    static RoundPlayerResult of(PokemonConnectionsProgress player, @Nullable Long elapsedMs) {
      return new RoundPlayerResult(player.status(), player.foundGroupIds().size(), player.foundGroupIds(),
          player.mistakesUsed(), player.completionRank(), elapsedMs, player.roundPoints());
    }
  }

  /** {@code PokemonConnectionsRoundResult}; {@code source} es {@code CURATED} o {@code DYNAMIC}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonConnectionsRoundResult(String source, List<ConnectionAnswerGroup> groups,
      Map<String, RoundPlayerResult> players) {

    public PokemonConnectionsRoundResult {
      groups = frozenList(groups);
      players = frozenMap(players);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record PokemonConnectionsState(
      GamePhase phase,
      PokemonConnectionsConfig config,
      List<String> playerIds,
      int roundNumber,
      List<ConnectionPokemon> board,
      List<ConnectionAnswerGroup> answerGroups,
      String puzzleSource,
      String puzzleKey,
      List<String> usedPuzzleKeys,
      List<String> recentCategoryIds,
      Map<String, PokemonConnectionsProgress> progress,
      List<String> completionOrder,
      Map<String, Integer> scores,
      Map<String, PokemonConnectionsStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokemonConnectionsRoundResult lastRound) {

    public PokemonConnectionsState {
      playerIds = frozenList(playerIds);
      board = frozenList(board);
      answerGroups = frozenList(answerGroups);
      usedPuzzleKeys = frozenList(usedPuzzleKeys);
      recentCategoryIds = frozenList(recentCategoryIds);
      progress = frozenMap(progress);
      completionOrder = frozenList(completionOrder);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).roundNumber(roundNumber).board(board)
          .answerGroups(answerGroups).puzzleSource(puzzleSource).puzzleKey(puzzleKey).usedPuzzleKeys(usedPuzzleKeys)
          .recentCategoryIds(recentCategoryIds).progress(progress).completionOrder(completionOrder).scores(scores)
          .playerStats(playerStats).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** Listas y mapas vacíos por defecto; {@code phase}, {@code config} y los textos los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokemonConnectionsConfig config;
      private List<String> playerIds = List.of();
      private int roundNumber;
      private List<ConnectionPokemon> board = List.of();
      private List<ConnectionAnswerGroup> answerGroups = List.of();
      private String puzzleSource;
      private String puzzleKey;
      private List<String> usedPuzzleKeys = List.of();
      private List<String> recentCategoryIds = List.of();
      private Map<String, PokemonConnectionsProgress> progress = Map.of();
      private List<String> completionOrder = List.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, PokemonConnectionsStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private PokemonConnectionsRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokemonConnectionsConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder board(List<ConnectionPokemon> value) { board = value; return this; }

      public Builder answerGroups(List<ConnectionAnswerGroup> value) { answerGroups = value; return this; }

      public Builder puzzleSource(String value) { puzzleSource = value; return this; }

      public Builder puzzleKey(String value) { puzzleKey = value; return this; }

      public Builder usedPuzzleKeys(List<String> value) { usedPuzzleKeys = value; return this; }

      public Builder recentCategoryIds(List<String> value) { recentCategoryIds = value; return this; }

      public Builder progress(Map<String, PokemonConnectionsProgress> value) { progress = value; return this; }

      public Builder completionOrder(List<String> value) { completionOrder = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, PokemonConnectionsStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable PokemonConnectionsRoundResult value) { lastRound = value; return this; }

      public PokemonConnectionsState build() {
        return new PokemonConnectionsState(Objects.requireNonNull(phase, "phase"),
            Objects.requireNonNull(config, "config"), playerIds, roundNumber, board, answerGroups,
            Objects.requireNonNull(puzzleSource, "puzzleSource"), Objects.requireNonNull(puzzleKey, "puzzleKey"),
            usedPuzzleKeys, recentCategoryIds, progress, completionOrder, scores, playerStats, roundStartedAt,
            roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /** Entrada de {@code playerProgress} de la proyección pública. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PlayerProgressView(int foundGroups, String status) {}

  /** Proyección pública; se construye con {@link #builder()} para no confundir contadores contiguos. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonConnectionsPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      int groupSize,
      int groupCount,
      List<ConnectionPokemon> board,
      Map<String, PlayerProgressView> playerProgress,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokemonConnectionsRoundResult lastRound,
      @Nullable GameResults results) {

    public PokemonConnectionsPublicState {
      board = frozenList(board);
      playerProgress = frozenMap(playerProgress);
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
      private int groupSize;
      private int groupCount;
      private List<ConnectionPokemon> board = List.of();
      private Map<String, PlayerProgressView> playerProgress = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private PokemonConnectionsRoundResult lastRound;
      private GameResults results;

      private Builder() {}

      public Builder gameId(String value) { gameId = value; return this; }

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder totalRounds(int value) { totalRounds = value; return this; }

      public Builder groupSize(int value) { groupSize = value; return this; }

      public Builder groupCount(int value) { groupCount = value; return this; }

      public Builder board(List<ConnectionPokemon> value) { board = value; return this; }

      public Builder playerProgress(Map<String, PlayerProgressView> value) { playerProgress = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable PokemonConnectionsRoundResult value) { lastRound = value; return this; }

      public Builder results(@Nullable GameResults value) { results = value; return this; }

      public PokemonConnectionsPublicState build() {
        return new PokemonConnectionsPublicState(Objects.requireNonNull(gameId, "gameId"),
            Objects.requireNonNull(phase, "phase"), roundNumber, totalRounds, groupSize, groupCount, board,
            playerProgress, scores, roundStartedAt, roundEndsAt, nextTransitionAt, lastRound, results);
      }
    }
  }

  /** {@code PokemonConnectionsPlayerState}: el espectador solo lleva {@code role}. */
  public sealed interface PokemonConnectionsPlayerState {

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Spectator(String role) implements PokemonConnectionsPlayerState {
      static final Spectator INSTANCE = new Spectator("SPECTATOR");
    }

    /** La variante {@code PLAYER}; se construye con {@link #builder()}. */
    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Player(String role, boolean canSubmit, List<ConnectionAnswerGroup> foundGroups, int mistakesUsed,
        int mistakesAllowed, String status, @Nullable Integer completionRank, int roundPoints,
        @Nullable ConnectionAttemptFeedback lastAttempt) implements PokemonConnectionsPlayerState {

      public Player {
        foundGroups = frozenList(foundGroups);
      }

      public static Builder builder() {
        return new Builder();
      }

      /** Setters con nombre; {@code role} es siempre {@code PLAYER}. */
      public static final class Builder {
        private boolean canSubmit;
        private List<ConnectionAnswerGroup> foundGroups = List.of();
        private int mistakesUsed;
        private int mistakesAllowed;
        private String status;
        private Integer completionRank;
        private int roundPoints;
        private ConnectionAttemptFeedback lastAttempt;

        private Builder() {}

        public Builder canSubmit(boolean value) { canSubmit = value; return this; }

        public Builder foundGroups(List<ConnectionAnswerGroup> value) { foundGroups = value; return this; }

        public Builder mistakesUsed(int value) { mistakesUsed = value; return this; }

        public Builder mistakesAllowed(int value) { mistakesAllowed = value; return this; }

        public Builder status(String value) { status = value; return this; }

        public Builder completionRank(@Nullable Integer value) { completionRank = value; return this; }

        public Builder roundPoints(int value) { roundPoints = value; return this; }

        public Builder lastAttempt(@Nullable ConnectionAttemptFeedback value) { lastAttempt = value; return this; }

        public Player build() {
          return new Player("PLAYER", canSubmit, foundGroups, mistakesUsed, mistakesAllowed,
              Objects.requireNonNull(status, "status"), completionRank, roundPoints, lastAttempt);
        }
      }
    }
  }

  /**
   * {@code pokemonConnectionsActionSchema}: unión discriminada por {@code type}, cada variante estricta.
   * {@code pokemonIds} trae de 3 a 5 textos de 1–96 unidades UTF-16, en su orden y con posibles repeticiones.
   */
  public sealed interface PokemonConnectionsAction {

    record SubmitGroup(List<String> pokemonIds) implements PokemonConnectionsAction {

      public SubmitGroup {
        pokemonIds = List.copyOf(pokemonIds);
      }
    }

    record AdvanceRound() implements PokemonConnectionsAction {}

    static PokemonConnectionsAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "SUBMIT_GROUP" -> {
          strict(raw, Set.of("type", "pokemonIds"));
          var ids = raw.get("pokemonIds");
          if (ids == null || !ids.isArray() || ids.size() < 3 || ids.size() > 5) throw invalid();
          var pokemonIds = new ArrayList<String>();
          for (var id : ids.values()) {
            if (!id.isString()) throw invalid();
            var text = id.getStringValue();
            if (text.isEmpty() || text.length() > 96) throw invalid();
            pokemonIds.add(text);
          }
          yield new SubmitGroup(pokemonIds);
        }
        case "ADVANCE_ROUND" -> {
          strict(raw, Set.of("type"));
          yield new AdvanceRound();
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
      return new ConfigValidationException("Acción de Pokémon Connections no válida.");
    }
  }
}

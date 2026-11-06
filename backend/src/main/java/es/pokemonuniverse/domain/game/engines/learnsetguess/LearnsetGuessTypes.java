package es.pokemonuniverse.domain.game.engines.learnsetguess;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonEvolutionInfo;
import es.pokemonuniverse.domain.pokemon.ResolvedLevelUpMove;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code learnset-guess/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class LearnsetGuessTypes {

  private LearnsetGuessTypes() {}

  /**
   * {@code LearnsetGuessPlayerStats}. Seis contadores contiguos: fuera de este record solo se construye con
   * {@link #ZERO} y los métodos con nombre.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record LearnsetGuessPlayerStats(int correct, int missed, int initialSolves, int incorrectGuesses,
      int pointsFromSolves, int bestRoundPoints) {

    /** {@code emptyLearnsetStats()}. */
    static final LearnsetGuessPlayerStats ZERO = new LearnsetGuessPlayerStats(0, 0, 0, 0, 0, 0);

    /** Ronda resuelta sin acierto. */
    LearnsetGuessPlayerStats afterMiss() {
      return new LearnsetGuessPlayerStats(correct, missed + 1, initialSolves, incorrectGuesses, pointsFromSolves,
          bestRoundPoints);
    }

    /** Intento fallido. */
    LearnsetGuessPlayerStats afterIncorrectGuess() {
      return new LearnsetGuessPlayerStats(correct, missed, initialSolves, incorrectGuesses + 1, pointsFromSolves,
          bestRoundPoints);
    }

    /** Acierto con {@code revealStage} grupos extra visibles. */
    LearnsetGuessPlayerStats afterSolve(int revealStage, int points) {
      return new LearnsetGuessPlayerStats(correct + 1, missed, initialSolves + (revealStage == 0 ? 1 : 0),
          incorrectGuesses, pointsFromSolves + points, Math.max(bestRoundPoints, points));
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record LearnsetGuessAttempt(String playerId, String pokemonId, String pokemonName, String sprite,
      long attemptedAt) {

    static LearnsetGuessAttempt of(String playerId, Pokemon guessed, long attemptedAt) {
      return new LearnsetGuessAttempt(playerId, guessed.id(), guessed.name(), guessed.sprite(), attemptedAt);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record LearnsetGuessSolve(int solveOrder, long solvedAt, int revealStage, int points) {}

  /** {@code LearnsetMoveHint}: {@code level} es nulo si la partida oculta los niveles. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record LearnsetMoveHint(String moveId, String name, @Nullable Integer level, String type, String category) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record LearnsetMoveGroup(@Nullable Integer level, List<LearnsetMoveHint> moves, int stage) {

    public LearnsetMoveGroup {
      moves = frozenList(moves);
    }
  }

  /** {@code LearnsetRoundResult.pokemon}; solo con {@link #of}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record LearnsetRoundPokemon(String id, String name, String sprite, int nationalDexNumber, int generation) {

    static LearnsetRoundPokemon of(Pokemon pokemon) {
      return new LearnsetRoundPokemon(pokemon.id(), pokemon.name(), pokemon.sprite(), pokemon.nationalDexNumber(),
          pokemon.generation());
    }
  }

  /**
   * {@code absentIds}: jugadores sin acierto que no estaban obligados a jugar al cerrar la ronda (no suman missed).
   * {@code groupsSeen} (grupos que vio cada jugador) y {@code totalGroups} solo salen en {@code MANUAL_REVEAL}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record LearnsetRoundResult(LearnsetRoundPokemon pokemon, int referenceGeneration, String referenceSource,
      List<LearnsetMoveHint> revealedMoves, List<LearnsetMoveHint> learnset, Map<String, LearnsetGuessSolve> solves,
      List<String> absentIds,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Map<String, Integer> groupsSeen,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Integer totalGroups) {

    public LearnsetRoundResult {
      revealedMoves = frozenList(revealedMoves);
      learnset = frozenList(learnset);
      solves = frozenMap(solves);
      absentIds = frozenList(absentIds);
      groupsSeen = groupsSeen == null ? null : frozenMap(groupsSeen);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 22 campos no se usa en el motor).
   * {@code manualMisses} solo cuenta en {@code MANUAL_REVEAL}: intentos fallidos de cada jugador en la ronda (ve
   * {@code 1 + fallos} grupos y los agota al fallar con todos a la vista).
   */
  public record LearnsetGuessState(
      GamePhase phase,
      LearnsetGuessConfig config,
      List<String> playerIds,
      int roundNumber,
      int referenceGeneration,
      @Nullable String correctPokemonId,
      List<String> usedPokemonIds,
      List<ResolvedLevelUpMove> learnset,
      @Nullable PokemonEvolutionInfo evolutionInfo,
      int initialGroupCount,
      int revealedExtraGroups,
      List<LearnsetGuessAttempt> attempts,
      Map<String, LearnsetGuessSolve> solves,
      Map<String, Long> cooldownUntil,
      boolean lastWarning,
      Map<String, Integer> scores,
      Map<String, LearnsetGuessPlayerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable LearnsetRoundResult lastRound,
      Map<String, Integer> manualMisses) implements TimedGameState {

    public LearnsetGuessState {
      playerIds = frozenList(playerIds);
      usedPokemonIds = frozenList(usedPokemonIds);
      learnset = frozenList(learnset);
      attempts = frozenList(attempts);
      solves = frozenMap(solves);
      cooldownUntil = frozenMap(cooldownUntil);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
      manualMisses = frozenMap(manualMisses);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).roundNumber(roundNumber)
          .referenceGeneration(referenceGeneration).correctPokemonId(correctPokemonId).usedPokemonIds(usedPokemonIds)
          .learnset(learnset).evolutionInfo(evolutionInfo).initialGroupCount(initialGroupCount)
          .revealedExtraGroups(revealedExtraGroups).attempts(attempts).solves(solves).cooldownUntil(cooldownUntil)
          .lastWarning(lastWarning).scores(scores).playerStats(playerStats).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound).manualMisses(manualMisses);
    }

    /** Listas y mapas vacíos por defecto; {@code phase} y {@code config} los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private LearnsetGuessConfig config;
      private List<String> playerIds = List.of();
      private int roundNumber;
      private int referenceGeneration;
      private String correctPokemonId;
      private List<String> usedPokemonIds = List.of();
      private List<ResolvedLevelUpMove> learnset = List.of();
      private PokemonEvolutionInfo evolutionInfo;
      private int initialGroupCount;
      private int revealedExtraGroups;
      private List<LearnsetGuessAttempt> attempts = List.of();
      private Map<String, LearnsetGuessSolve> solves = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private boolean lastWarning;
      private Map<String, Integer> scores = Map.of();
      private Map<String, LearnsetGuessPlayerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private LearnsetRoundResult lastRound;
      private Map<String, Integer> manualMisses = Map.of();

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(LearnsetGuessConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder referenceGeneration(int value) { referenceGeneration = value; return this; }

      public Builder correctPokemonId(@Nullable String value) { correctPokemonId = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder learnset(List<ResolvedLevelUpMove> value) { learnset = value; return this; }

      public Builder evolutionInfo(@Nullable PokemonEvolutionInfo value) { evolutionInfo = value; return this; }

      public Builder initialGroupCount(int value) { initialGroupCount = value; return this; }

      public Builder revealedExtraGroups(int value) { revealedExtraGroups = value; return this; }

      public Builder attempts(List<LearnsetGuessAttempt> value) { attempts = value; return this; }

      public Builder solves(Map<String, LearnsetGuessSolve> value) { solves = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder lastWarning(boolean value) { lastWarning = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, LearnsetGuessPlayerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable LearnsetRoundResult value) { lastRound = value; return this; }

      public Builder manualMisses(Map<String, Integer> value) { manualMisses = value; return this; }

      public LearnsetGuessState build() {
        return new LearnsetGuessState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, roundNumber, referenceGeneration, correctPokemonId, usedPokemonIds, learnset, evolutionInfo,
            initialGroupCount, revealedExtraGroups, attempts, solves, cooldownUntil, lastWarning, scores,
            playerStats,
            roundStartedAt, roundEndsAt, nextTransitionAt, lastRound, manualMisses);
      }
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record LearnsetGuessSolvedPlayer(String playerId, int solveOrder) {}

  /**
   * {@code LearnsetGuessPublicState}: componentes en el orden del literal de {@code getPublicState}; {@code mode} va
   * siempre detrás de {@code phase}. En {@code MANUAL_REVEAL} no lleva grupos ni intentos durante la ronda (son de
   * cada jugador) ni {@code nextTransitionAt} de pista.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record LearnsetGuessPublicState(
      String gameId,
      GamePhase phase,
      LearnsetGuessMode mode,
      int roundNumber,
      int totalRounds,
      int referenceGeneration,
      String referenceSource,
      List<LearnsetMoveGroup> visibleGroups,
      @Nullable String evolutionHint,
      List<LearnsetGuessAttempt> attempts,
      List<LearnsetGuessSolvedPlayer> solvedPlayers,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      boolean lastWarning,
      @Nullable LearnsetRoundResult lastRound,
      Map<String, Integer> scores,
      @Nullable GameResults results) {}

  /**
   * Estado de cada jugador. En {@code MANUAL_REVEAL}, y solo para quien juega la partida, lleva los grupos que él ve
   * ({@code revealedGroups}), sus intentos fallidos de la ronda ({@code attempts}) y el total de grupos; en Clásico
   * esos campos no salen.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record LearnsetGuessPlayerState(boolean canGuess, boolean solved, @Nullable Integer solveOrder,
      @Nullable Long cooldownUntil, int roundPoints,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<LearnsetMoveGroup> revealedGroups,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<LearnsetGuessAttempt> attempts,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Integer totalGroups) {

    public LearnsetGuessPlayerState {
      revealedGroups = revealedGroups == null ? null : frozenList(revealedGroups);
      attempts = attempts == null ? null : frozenList(attempts);
    }
  }

  /** {@code learnsetGuessActionSchema}: {@code { type: 'GUESS_POKEMON', pokemonId }} estricto, id de 1 a 64. */
  public record LearnsetGuessAction(String pokemonId) {

    private static final Set<String> KEYS = Set.of("type", "pokemonId");

    /** {@code z.string().min(1).max(64)} cuenta unidades UTF-16, igual que {@link String#length()}. */
    public static LearnsetGuessAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"GUESS_POKEMON".equals(type.getStringValue())) throw invalid();
      var pokemonId = raw.get("pokemonId");
      if (pokemonId == null || !pokemonId.isString()) throw invalid();
      var id = pokemonId.getStringValue();
      if (id.isEmpty() || id.length() > 64) throw invalid();
      return new LearnsetGuessAction(id);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Learnset Guess no válida.");
    }
  }
}

package es.pokemonuniverse.domain.game.engines.whosthatpokemon;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.GuessLastAttempt;
import es.pokemonuniverse.domain.game.engine.infra.GuessPlayerStats;
import es.pokemonuniverse.domain.game.engine.infra.GuessPokemonSummary;
import es.pokemonuniverse.domain.game.engine.infra.GuessingState;
import es.pokemonuniverse.domain.game.engine.infra.SpeedPodiumScore;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Estado, acciones y proyecciones; las proyecciones tienen su tipo TS en {@code whos-that-pokemon/types.ts}.
 * Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class WhosThatPokemonTypes {

  private WhosThatPokemonTypes() {}

  /**
   * {@code WhosThatPokemonHint}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind}
   * primero y solo sus campos; Serde serializa el tipo concreto, sin propiedad de tipo añadida.
   */
  public sealed interface WhosThatPokemonHint {

    String kind();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Generation(String kind, int value) implements WhosThatPokemonHint {
      Generation(int value) { this("GENERATION", value); }
    }

    /** {@code TYPE}: un solo tipo (el primero del Pokémon). */
    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Type(String kind, String value) implements WhosThatPokemonHint {
      Type(String value) { this("TYPE", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record TypeCount(String kind, int value) implements WhosThatPokemonHint {
      TypeCount(int value) { this("TYPE_COUNT", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Evolution(String kind, int stage, int stages) implements WhosThatPokemonHint {
      Evolution(int stage, int stages) { this("EVOLUTION", stage, stages); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Category(String kind, String value) implements WhosThatPokemonHint {
      Category(String value) { this("CATEGORY", value); }
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhosThatPokemonAttempt(String playerId, GuessPokemonSummary guessedPokemon, long attemptedAt) {}

  /**
   * {@code WhosThatPokemonSolve}. Cuatro enteros contiguos: fuera de este record solo se construye con {@link #of}, que
   * toma la puntuación como {@link SpeedPodiumScore}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhosThatPokemonSolve(int solveOrder, long solvedAt, long elapsedMs, int speedPoints,
      int placementBonus, int points, int attempts,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Integer streakBonus) {

    static WhosThatPokemonSolve of(int solveOrder, long solvedAt, long elapsedMs, SpeedPodiumScore score, int attempts,
        @Nullable Integer streakBonus) {
      return new WhosThatPokemonSolve(solveOrder, solvedAt, elapsedMs, score.speedPoints(), score.placementBonus(),
          score.totalPoints() + (streakBonus == null ? 0 : streakBonus), attempts, streakBonus);
    }
  }

  /** {@code { id, name, sprite, generation }} del Pokémon revelado (solo en el estado). */
  public record WhosThatPokemonRoundPokemon(String id, String name, String sprite, int generation) {}

  /** {@code WhosThatPokemonRoundResult} (solo en el estado). */
  public record WhosThatPokemonRoundResult(WhosThatPokemonRoundPokemon pokemon,
      Map<String, WhosThatPokemonSolve> solves, Map<String, Integer> attemptCounts) {

    public WhosThatPokemonRoundResult {
      solves = frozenMap(solves);
      attemptCounts = frozenMap(attemptCounts);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 20 campos no se usa en el motor).
   */
  public record WhosThatPokemonState(
      GamePhase phase,
      WhosThatPokemonConfig config,
      String assetToken,
      List<String> playerIds,
      List<String> poolIds,
      int roundNumber,
      @Nullable String targetPokemonId,
      List<String> usedPokemonIds,
      List<WhosThatPokemonAttempt> attempts,
      Map<String, Integer> attemptCounts,
      Map<String, WhosThatPokemonSolve> solves,
      Map<String, Long> cooldownUntil,
      Map<String, GuessLastAttempt> lastAttemptResult,
      Map<String, Integer> scores,
      Map<String, GuessPlayerStats> playerStats,
      Map<String, Integer> streaks,
      int revealedHintCount,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable WhosThatPokemonRoundResult lastRound) implements GuessingState {

    public WhosThatPokemonState {
      playerIds = frozenList(playerIds);
      poolIds = frozenList(poolIds);
      usedPokemonIds = frozenList(usedPokemonIds);
      attempts = frozenList(attempts);
      attemptCounts = frozenMap(attemptCounts);
      solves = frozenMap(solves);
      cooldownUntil = frozenMap(cooldownUntil);
      lastAttemptResult = frozenMap(lastAttemptResult);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
      streaks = frozenMap(streaks);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).assetToken(assetToken).playerIds(playerIds).poolIds(poolIds)
          .roundNumber(roundNumber).targetPokemonId(targetPokemonId).usedPokemonIds(usedPokemonIds).attempts(attempts)
          .attemptCounts(attemptCounts).solves(solves).cooldownUntil(cooldownUntil)
          .lastAttemptResult(lastAttemptResult).scores(scores).playerStats(playerStats).streaks(streaks)
          .revealedHintCount(revealedHintCount).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    WhosThatPokemonState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@link #build()} exige {@code phase}, {@code config} y {@code assetToken}. */
    public static final class Builder {
      private GamePhase phase;
      private WhosThatPokemonConfig config;
      private String assetToken;
      private List<String> playerIds = List.of();
      private List<String> poolIds = List.of();
      private int roundNumber;
      private String targetPokemonId;
      private List<String> usedPokemonIds = List.of();
      private List<WhosThatPokemonAttempt> attempts = List.of();
      private Map<String, Integer> attemptCounts = Map.of();
      private Map<String, WhosThatPokemonSolve> solves = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, GuessLastAttempt> lastAttemptResult = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, GuessPlayerStats> playerStats = Map.of();
      private Map<String, Integer> streaks = Map.of();
      private int revealedHintCount;
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private WhosThatPokemonRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(WhosThatPokemonConfig value) { config = value; return this; }

      public Builder assetToken(String value) { assetToken = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder targetPokemonId(@Nullable String value) { targetPokemonId = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder attempts(List<WhosThatPokemonAttempt> value) { attempts = value; return this; }

      public Builder attemptCounts(Map<String, Integer> value) { attemptCounts = value; return this; }

      public Builder solves(Map<String, WhosThatPokemonSolve> value) { solves = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder lastAttemptResult(Map<String, GuessLastAttempt> value) {
        lastAttemptResult = value;
        return this;
      }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, GuessPlayerStats> value) { playerStats = value; return this; }

      /** Aciertos seguidos de cada jugador hasta la última ronda (solo con {@code streakBonus}). */
      public Builder streaks(Map<String, Integer> value) { streaks = value; return this; }

      public Builder revealedHintCount(int value) { revealedHintCount = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable WhosThatPokemonRoundResult value) { lastRound = value; return this; }

      public WhosThatPokemonState build() {
        return new WhosThatPokemonState(Objects.requireNonNull(phase, "phase"),
            Objects.requireNonNull(config, "config"), Objects.requireNonNull(assetToken, "assetToken"), playerIds,
            poolIds, roundNumber, targetPokemonId, usedPokemonIds, attempts, attemptCounts, solves, cooldownUntil,
            lastAttemptResult, scores, playerStats, streaks, revealedHintCount, roundStartedAt, roundEndsAt, nextTransitionAt,
            lastRound);
      }
    }
  }

  /** {@code { name, generation, sprite }}: {@code sprite} es la ruta opaca {@code reveal}, nunca la URL real. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhosThatPokemonPublicPokemon(String name, int generation, String sprite) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhosThatPokemonRoundPublicResult(WhosThatPokemonPublicPokemon pokemon,
      Map<String, WhosThatPokemonSolve> solves, Map<String, Integer> attemptCounts) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhosThatPokemonSolvedPlayer(String playerId, int solveOrder) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhosThatPokemonPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      @Nullable String silhouetteSprite,
      List<WhosThatPokemonHint> visibleHints,
      List<WhosThatPokemonAttempt> attempts,
      List<WhosThatPokemonSolvedPlayer> solvedPlayers,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable WhosThatPokemonRoundPublicResult lastRound,
      @Nullable GameResults results) {}

  /** {@code attempts}: con {@code publicAttempts} apagado, solo los fallos propios de la ronda; si no, no se envía. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhosThatPokemonPlayerState(boolean canGuess, boolean solved, @Nullable Integer solveOrder,
      @Nullable Long cooldownUntil, int roundPoints, int attemptCount,
      @Nullable GuessLastAttempt lastAttempt,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<WhosThatPokemonAttempt> attempts,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Integer streak) {}

  /** {@code whosThatPokemonActionSchema}: {@code { type: 'GUESS_POKEMON', pokemonId }} estricto, id de 1 a 96. */
  public record WhosThatPokemonAction(String pokemonId) {

    private static final Set<String> KEYS = Set.of("type", "pokemonId");

    /** {@code z.string().min(1).max(96)} cuenta unidades UTF-16, igual que {@link String#length()}. */
    public static WhosThatPokemonAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"GUESS_POKEMON".equals(type.getStringValue())) throw invalid();
      var pokemonId = raw.get("pokemonId");
      if (pokemonId == null || !pokemonId.isString()) throw invalid();
      var id = pokemonId.getStringValue();
      if (id.isEmpty() || id.length() > 96) throw invalid();
      return new WhosThatPokemonAction(id);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de ¿Quién es ese Pokémon? no válida.");
    }
  }
}

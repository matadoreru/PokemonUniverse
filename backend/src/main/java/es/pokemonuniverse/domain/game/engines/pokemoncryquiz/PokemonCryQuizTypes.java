package es.pokemonuniverse.domain.game.engines.pokemoncryquiz;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.PokemonAudioCatalog.CryVersion;
import es.pokemonuniverse.domain.game.engine.infra.GuessSolveStats;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code pokemon-cry-quiz/types.ts}. {@code PokemonCryVersion} es {@link CryVersion} del catálogo de audio.
 * Los {@code Record<string, …>} son mapas inmutables con orden de inserción ({@code Immutables.frozenMap}); cada
 * transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokemonCryQuizTypes {

  private PokemonCryQuizTypes() {}

  /** {@code 'PLAYER' | 'SPECTATOR'}. */
  public enum PokemonCryQuizRole { PLAYER, SPECTATOR }

  /** {@code 'CORRECT' | 'INCORRECT'}. */
  public enum PokemonCryQuizAttemptOutcome { CORRECT, INCORRECT }

  /** {@code { id, name, sprite }} ({@code reveal} de {@code server.ts}). */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonCryQuizPokemonSummary(String id, String name, String sprite) {

    static PokemonCryQuizPokemonSummary of(Pokemon pokemon) {
      return new PokemonCryQuizPokemonSummary(pokemon.id(), pokemon.name(), pokemon.sprite());
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonCryQuizAttempt(String playerId, PokemonCryQuizPokemonSummary guessedPokemon,
      long attemptedAt) {}

  /** Resultado de {@code pokemonCryScore} de {@code rules.ts}. */
  public record PokemonCryScore(int speedPoints, int placementBonus, int totalPoints) {}

  /**
   * {@code PokemonCryQuizSolve}. Cuatro enteros contiguos: fuera de este record solo se construye con {@link #of}, que
   * toma la puntuación como {@link PokemonCryScore}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonCryQuizSolve(int solveOrder, long solvedAt, long elapsedMs, int speedPoints,
      int placementBonus, int points, int attempts) {

    static PokemonCryQuizSolve of(int solveOrder, long solvedAt, long elapsedMs, PokemonCryScore score, int attempts) {
      return new PokemonCryQuizSolve(solveOrder, solvedAt, elapsedMs, score.speedPoints(), score.placementBonus(),
          score.totalPoints(), attempts);
    }
  }

  /**
   * {@code PokemonCryQuizStats}. Muchos contadores contiguos: fuera de este record solo se construye con
   * {@link #ZERO}, {@link #withSolve} ({@code recordGuessSolve}) y los métodos con nombre.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonCryQuizPlayerStats(int correct, int missed, int totalAttempts, int firstTry, int roundFirsts,
      long solveTimeTotalMs, long bestTimeMs, int pointsFromRounds)
      implements GuessSolveStats<PokemonCryQuizPlayerStats> {

    static final PokemonCryQuizPlayerStats ZERO = new PokemonCryQuizPlayerStats(0, 0, 0, 0, 0, 0, 0, 0);

    @Override
    public PokemonCryQuizPlayerStats withSolve(int correct, int totalAttempts, int firstTry, int roundFirsts,
        long solveTimeTotalMs, long bestTimeMs, int pointsFromRounds) {
      return new PokemonCryQuizPlayerStats(correct, missed, totalAttempts, firstTry, roundFirsts, solveTimeTotalMs,
          bestTimeMs, pointsFromRounds);
    }

    /** Ronda resuelta sin acierto. */
    PokemonCryQuizPlayerStats afterMiss() {
      return new PokemonCryQuizPlayerStats(correct, missed + 1, totalAttempts, firstTry, roundFirsts,
          solveTimeTotalMs, bestTimeMs, pointsFromRounds);
    }

    /** Intento fallido. */
    PokemonCryQuizPlayerStats afterWrongAttempt() {
      return new PokemonCryQuizPlayerStats(correct, missed, totalAttempts + 1, firstTry, roundFirsts,
          solveTimeTotalMs, bestTimeMs, pointsFromRounds);
    }

    /** {@code { ...entry.stats }} con las claves de TS, en su orden. */
    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("correct", correct);
      mapped.put("missed", missed);
      mapped.put("totalAttempts", totalAttempts);
      mapped.put("firstTry", firstTry);
      mapped.put("roundFirsts", roundFirsts);
      mapped.put("solveTimeTotalMs", solveTimeTotalMs);
      mapped.put("bestTimeMs", bestTimeMs);
      mapped.put("pointsFromRounds", pointsFromRounds);
      return mapped;
    }
  }

  /** {@code { id, name, sprite, generation }} del Pokémon revelado (solo en el estado). */
  public record PokemonCryQuizRoundPokemon(String id, String name, String sprite, int generation) {}

  /** {@code PokemonCryQuizRoundResult} (solo en el estado). */
  public record PokemonCryQuizRoundResult(PokemonCryQuizRoundPokemon pokemon, CryVersion cryVersion,
      Map<String, PokemonCryQuizSolve> solves, Map<String, Integer> attemptCounts) {

    public PokemonCryQuizRoundResult {
      solves = frozenMap(solves);
      attemptCounts = frozenMap(attemptCounts);
    }
  }

  /** {@code { result: 'CORRECT' | 'INCORRECT'; attemptedAt }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonCryQuizLastAttempt(PokemonCryQuizAttemptOutcome result, long attemptedAt) {}

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 20 campos no se usa en el motor).
   */
  public record PokemonCryQuizState(
      GamePhase phase,
      PokemonCryQuizConfig config,
      String assetToken,
      List<String> playerIds,
      List<String> poolIds,
      int roundNumber,
      @Nullable String targetPokemonId,
      @Nullable CryVersion currentCryVersion,
      List<String> usedPokemonIds,
      List<PokemonCryQuizAttempt> attempts,
      Map<String, Integer> attemptCounts,
      Map<String, PokemonCryQuizSolve> solves,
      Map<String, Long> cooldownUntil,
      Map<String, PokemonCryQuizLastAttempt> lastAttemptResult,
      Map<String, Integer> scores,
      Map<String, PokemonCryQuizPlayerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokemonCryQuizRoundResult lastRound) implements TimedGameState {

    public PokemonCryQuizState {
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
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).assetToken(assetToken).playerIds(playerIds).poolIds(poolIds)
          .roundNumber(roundNumber).targetPokemonId(targetPokemonId).currentCryVersion(currentCryVersion)
          .usedPokemonIds(usedPokemonIds).attempts(attempts)
          .attemptCounts(attemptCounts).solves(solves).cooldownUntil(cooldownUntil)
          .lastAttemptResult(lastAttemptResult).scores(scores).playerStats(playerStats)
          .roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    PokemonCryQuizState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@link #build()} exige {@code phase}, {@code config} y {@code assetToken}. */
    public static final class Builder {
      private GamePhase phase;
      private PokemonCryQuizConfig config;
      private String assetToken;
      private List<String> playerIds = List.of();
      private List<String> poolIds = List.of();
      private int roundNumber;
      private String targetPokemonId;
      private CryVersion currentCryVersion;
      private List<String> usedPokemonIds = List.of();
      private List<PokemonCryQuizAttempt> attempts = List.of();
      private Map<String, Integer> attemptCounts = Map.of();
      private Map<String, PokemonCryQuizSolve> solves = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, PokemonCryQuizLastAttempt> lastAttemptResult = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, PokemonCryQuizPlayerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private PokemonCryQuizRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokemonCryQuizConfig value) { config = value; return this; }

      public Builder assetToken(String value) { assetToken = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder targetPokemonId(@Nullable String value) { targetPokemonId = value; return this; }

      public Builder currentCryVersion(@Nullable CryVersion value) { currentCryVersion = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder attempts(List<PokemonCryQuizAttempt> value) { attempts = value; return this; }

      public Builder attemptCounts(Map<String, Integer> value) { attemptCounts = value; return this; }

      public Builder solves(Map<String, PokemonCryQuizSolve> value) { solves = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder lastAttemptResult(Map<String, PokemonCryQuizLastAttempt> value) {
        lastAttemptResult = value;
        return this;
      }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, PokemonCryQuizPlayerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable PokemonCryQuizRoundResult value) { lastRound = value; return this; }

      public PokemonCryQuizState build() {
        return new PokemonCryQuizState(Objects.requireNonNull(phase, "phase"),
            Objects.requireNonNull(config, "config"), Objects.requireNonNull(assetToken, "assetToken"), playerIds,
            poolIds, roundNumber, targetPokemonId, currentCryVersion, usedPokemonIds, attempts, attemptCounts, solves,
            cooldownUntil, lastAttemptResult, scores, playerStats, roundStartedAt, roundEndsAt, nextTransitionAt,
            lastRound);
      }
    }
  }

  /** {@code { name, sprite, generation }}: aquí {@code sprite} es la URL real del sprite (no hay ruta opaca). */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonCryQuizPublicPokemon(String name, String sprite, int generation) {}

  /** {@code lastRound} público: {@code cryUrl} es la ruta opaca del grito de la ronda. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonCryQuizRoundPublicResult(PokemonCryQuizPublicPokemon pokemon, CryVersion cryVersion,
      String cryUrl, Map<String, PokemonCryQuizSolve> solves, Map<String, Integer> attemptCounts) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonCryQuizSolvedPlayer(String playerId, int solveOrder) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonCryQuizPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      @Nullable String cryUrl,
      List<PokemonCryQuizAttempt> attempts,
      List<PokemonCryQuizSolvedPlayer> solvedPlayers,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokemonCryQuizRoundPublicResult lastRound,
      @Nullable GameResults results) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonCryQuizPlayerState(PokemonCryQuizRole role, boolean canGuess, boolean solved,
      @Nullable Integer solveOrder, @Nullable Long cooldownUntil, int roundPoints, int attemptCount,
      @Nullable PokemonCryQuizLastAttempt lastAttempt) {}

  /** {@code whosThatPokemonActionSchema}: {@code { type: 'GUESS_POKEMON', pokemonId }} estricto, id de 1 a 96. */
  public record PokemonCryQuizAction(String pokemonId) {

    private static final Set<String> KEYS = Set.of("type", "pokemonId");

    /** {@code z.string().min(1).max(96)} cuenta unidades UTF-16, igual que {@link String#length()}. */
    public static PokemonCryQuizAction parse(JsonNode raw) {
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
      return new PokemonCryQuizAction(id);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de ¿Quién es ese Pokémon? no válida.");
    }
  }
}

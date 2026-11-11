package es.pokemonuniverse.domain.game.engines.guessfromstats;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.GuessSolveStats;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Estado, acciones y proyecciones; las proyecciones tienen su tipo TS en {@code guess-from-stats/types.ts}.
 * Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class GuessFromStatsTypes {

  private GuessFromStatsTypes() {}

  /** {@code GuessFromStatsVisibleStat}; {@code key} es la clave de TS ({@code specialAttack}, {@code bst}…). */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsVisibleStat(String key, int value) {}

  /**
   * {@code GuessFromStatsHint}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind} primero
   * y solo sus campos; Serde serializa el tipo concreto, sin propiedad de tipo añadida.
   */
  public sealed interface GuessFromStatsHint {

    String kind();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Generation(String kind, int value) implements GuessFromStatsHint {
      Generation(int value) { this("GENERATION", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Types(String kind, List<String> value) implements GuessFromStatsHint {
      public Types {
        value = frozenList(value);
      }

      Types(List<String> value) { this("TYPES", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record TypeCount(String kind, int value) implements GuessFromStatsHint {
      TypeCount(int value) { this("TYPE_COUNT", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Evolution(String kind, String value) implements GuessFromStatsHint {
      Evolution(GuessFromStatsEvolution value) { this("EVOLUTION", value.name()); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Height(String kind, int decimeters) implements GuessFromStatsHint {
      Height(int decimeters) { this("HEIGHT", decimeters); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Weight(String kind, int hectograms) implements GuessFromStatsHint {
      Weight(int hectograms) { this("WEIGHT", hectograms); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Category(String kind, String value) implements GuessFromStatsHint {
      Category(String value) { this("CATEGORY", value); }
    }
  }

  /** {@code GuessFromStatsEvolution}. */
  public enum GuessFromStatsEvolution { BASE, MIDDLE, FINAL, NO_EVOLUTION }

  /** {@code 'CORRECT' | 'INCORRECT'}. */
  public enum GuessFromStatsAttemptOutcome { CORRECT, INCORRECT }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsPokemonSummary(String id, String name, String sprite) {

    static GuessFromStatsPokemonSummary of(Pokemon pokemon) {
      return new GuessFromStatsPokemonSummary(pokemon.id(), pokemon.name(), pokemon.sprite());
    }
  }

  /** {@code GuessFromStatsPokemonReveal}: el resumen más generación, tipos y estadísticas; solo con {@link #of}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsPokemonReveal(String id, String name, String sprite, int generation, List<String> types,
      int hp, int attack, int defense, int specialAttack, int specialDefense, int speed, int bst) {

    public GuessFromStatsPokemonReveal {
      types = frozenList(types);
    }

    static GuessFromStatsPokemonReveal of(Pokemon pokemon) {
      return new GuessFromStatsPokemonReveal(pokemon.id(), pokemon.name(), pokemon.sprite(), pokemon.generation(),
          pokemon.types(), pokemon.hp(), pokemon.attack(), pokemon.defense(), pokemon.specialAttack(),
          pokemon.specialDefense(), pokemon.speed(), GuessFromStatsRules.pokemonBaseStatTotal(pokemon));
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsAttempt(String playerId, GuessFromStatsPokemonSummary guessedPokemon, long attemptedAt) {}

  /** {@code GuessFromStatsSolve} (solo en el estado). */
  public record GuessFromStatsSolve(int solveOrder, long solvedAt, long elapsedMs, int points, int attempts,
      String submittedPokemonId) {}

  /** {@code GuessFromStatsPublicSolve}: el acierto con el Pokémon enviado en lugar de su id. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsPublicSolve(int solveOrder, long solvedAt, long elapsedMs, int points, int attempts,
      GuessFromStatsPokemonSummary submittedPokemon) {}

  /**
   * {@code GuessFromStatsPlayerStats}. Muchos contadores contiguos: fuera de este record solo se construye con
   * {@link #ZERO}, {@link #withSolve} ({@code recordGuessSolve}) y los métodos con nombre.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsPlayerStats(int correct, int missed, int totalAttempts, int firstTry, int roundFirsts,
      long solveTimeTotalMs, long bestTimeMs, int pointsFromRounds) implements GuessSolveStats<GuessFromStatsPlayerStats> {

    static final GuessFromStatsPlayerStats ZERO = new GuessFromStatsPlayerStats(0, 0, 0, 0, 0, 0, 0, 0);

    @Override
    public GuessFromStatsPlayerStats withSolve(int correct, int totalAttempts, int firstTry, int roundFirsts,
        long solveTimeTotalMs, long bestTimeMs, int pointsFromRounds) {
      return new GuessFromStatsPlayerStats(correct, missed, totalAttempts, firstTry, roundFirsts, solveTimeTotalMs,
          bestTimeMs, pointsFromRounds);
    }

    /** Ronda resuelta sin acierto. */
    GuessFromStatsPlayerStats afterMiss() {
      return new GuessFromStatsPlayerStats(correct, missed + 1, totalAttempts, firstTry, roundFirsts, solveTimeTotalMs,
          bestTimeMs, pointsFromRounds);
    }

    /** Intento fallido. */
    GuessFromStatsPlayerStats afterWrongAttempt() {
      return new GuessFromStatsPlayerStats(correct, missed, totalAttempts + 1, firstTry, roundFirsts, solveTimeTotalMs,
          bestTimeMs, pointsFromRounds);
    }
  }

  /** {@code GuessFromStatsPreparedRound} (solo en el estado). */
  public record GuessFromStatsPreparedRound(String sourcePokemonId, String signature, List<String> acceptedPokemonIds,
      List<GuessFromStatsVisibleStat> visibleStats, List<GuessFromStatsHint> hints) {

    public GuessFromStatsPreparedRound {
      acceptedPokemonIds = frozenList(acceptedPokemonIds);
      visibleStats = frozenList(visibleStats);
      hints = frozenList(hints);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsRoundResult(List<GuessFromStatsPokemonReveal> answers,
      List<GuessFromStatsVisibleStat> visibleStats, List<GuessFromStatsHint> hints,
      Map<String, GuessFromStatsPublicSolve> solves, Map<String, Integer> attemptCounts) {

    public GuessFromStatsRoundResult {
      answers = frozenList(answers);
      visibleStats = frozenList(visibleStats);
      hints = frozenList(hints);
      solves = frozenMap(solves);
      attemptCounts = frozenMap(attemptCounts);
    }
  }

  /** {@code { result: 'CORRECT' | 'INCORRECT'; attemptedAt }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsLastAttempt(GuessFromStatsAttemptOutcome result, long attemptedAt) {}

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 18 campos no se usa en el motor).
   */
  public record GuessFromStatsState(
      GamePhase phase,
      GuessFromStatsConfig config,
      List<String> playerIds,
      List<String> poolIds,
      List<GuessFromStatsPreparedRound> roundDeck,
      int roundNumber,
      List<GuessFromStatsAttempt> attempts,
      Map<String, Integer> attemptCounts,
      Map<String, GuessFromStatsSolve> solves,
      Map<String, Long> cooldownUntil,
      Map<String, GuessFromStatsLastAttempt> lastAttemptResult,
      Map<String, Integer> scores,
      Map<String, GuessFromStatsPlayerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable GuessFromStatsRoundResult lastRound) implements TimedGameState {

    public GuessFromStatsState {
      playerIds = frozenList(playerIds);
      poolIds = frozenList(poolIds);
      roundDeck = frozenList(roundDeck);
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
      return new Builder().phase(phase).config(config).playerIds(playerIds).poolIds(poolIds).roundDeck(roundDeck)
          .roundNumber(roundNumber).attempts(attempts).attemptCounts(attemptCounts).solves(solves)
          .cooldownUntil(cooldownUntil).lastAttemptResult(lastAttemptResult).scores(scores).playerStats(playerStats)
          .roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt)
          .lastRound(lastRound);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    GuessFromStatsState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@code phase} y {@code config} los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private GuessFromStatsConfig config;
      private List<String> playerIds = List.of();
      private List<String> poolIds = List.of();
      private List<GuessFromStatsPreparedRound> roundDeck = List.of();
      private int roundNumber;
      private List<GuessFromStatsAttempt> attempts = List.of();
      private Map<String, Integer> attemptCounts = Map.of();
      private Map<String, GuessFromStatsSolve> solves = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, GuessFromStatsLastAttempt> lastAttemptResult = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, GuessFromStatsPlayerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private GuessFromStatsRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(GuessFromStatsConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder roundDeck(List<GuessFromStatsPreparedRound> value) { roundDeck = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder attempts(List<GuessFromStatsAttempt> value) { attempts = value; return this; }

      public Builder attemptCounts(Map<String, Integer> value) { attemptCounts = value; return this; }

      public Builder solves(Map<String, GuessFromStatsSolve> value) { solves = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder lastAttemptResult(Map<String, GuessFromStatsLastAttempt> value) {
        lastAttemptResult = value;
        return this;
      }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, GuessFromStatsPlayerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable GuessFromStatsRoundResult value) { lastRound = value; return this; }

      public GuessFromStatsState build() {
        return new GuessFromStatsState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, poolIds, roundDeck, roundNumber, attempts, attemptCounts, solves, cooldownUntil,
            lastAttemptResult, scores, playerStats, roundStartedAt, roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsSolvedPlayer(String playerId, int solveOrder) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      List<GuessFromStatsVisibleStat> visibleStats,
      List<GuessFromStatsHint> hints,
      List<GuessFromStatsAttempt> attempts,
      List<GuessFromStatsSolvedPlayer> solvedPlayers,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable GuessFromStatsRoundResult lastRound,
      @Nullable GameResults results) {}

  /** {@code attempts}: con {@code publicAttempts} apagado, solo los fallos propios de la ronda; si no, no se envía. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record GuessFromStatsPlayerState(boolean canGuess, boolean solved, @Nullable Integer solveOrder,
      @Nullable Long cooldownUntil, int roundPoints, int attemptCount, @Nullable GuessFromStatsLastAttempt lastAttempt,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<GuessFromStatsAttempt> attempts) {}

  /** {@code guessFromStatsActionSchema}: {@code { type: 'GUESS_POKEMON', pokemonId }} estricto, id de 1 a 96. */
  public record GuessFromStatsAction(String pokemonId) {

    private static final Set<String> KEYS = Set.of("type", "pokemonId");

    /** {@code z.string().min(1).max(96)} cuenta unidades UTF-16, igual que {@link String#length()}. */
    public static GuessFromStatsAction parse(JsonNode raw) {
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
      return new GuessFromStatsAction(id);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Guess from Stats no válida.");
    }
  }
}

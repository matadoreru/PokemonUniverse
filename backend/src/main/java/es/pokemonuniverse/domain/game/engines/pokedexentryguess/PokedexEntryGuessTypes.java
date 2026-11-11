package es.pokemonuniverse.domain.game.engines.pokedexentryguess;

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
import es.pokemonuniverse.domain.pokemon.PokedexEntry;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Estado, acciones y proyecciones; las proyecciones tienen su tipo TS en {@code pokedex-entry-guess/types.ts}.
 * Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokedexEntryGuessTypes {

  private PokedexEntryGuessTypes() {}

  /**
   * {@code PokedexEntryGuessHint}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind}
   * primero y solo sus campos; Serde serializa el tipo concreto, sin propiedad de tipo añadida.
   */
  public sealed interface PokedexEntryGuessHint {

    String kind();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Generation(String kind, int value) implements PokedexEntryGuessHint {
      Generation(int value) { this("GENERATION", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Type(String kind, String value) implements PokedexEntryGuessHint {
      Type(String value) { this("TYPE", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record TypeCount(String kind, int value) implements PokedexEntryGuessHint {
      TypeCount(int value) { this("TYPE_COUNT", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Evolution(String kind, int stage, int stages) implements PokedexEntryGuessHint {
      Evolution(int stage, int stages) { this("EVOLUTION", stage, stages); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Category(String kind, String value) implements PokedexEntryGuessHint {
      Category(String value) { this("CATEGORY", value); }
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokedexEntryGuessAttempt(String playerId, GuessPokemonSummary guessedPokemon, long attemptedAt) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokedexEntryGuessSolve(int solveOrder, long solvedAt, long elapsedMs, int points, int attempts) {}

  /** {@code PokedexEntryGuessRoundTarget} (solo en el estado). */
  public record PokedexEntryGuessRoundTarget(String pokemonId, PokedexEntry entry) {}

  /** {@code PokedexEntryGuessRoundResult.pokemon} (solo en el estado); solo con {@link #of}. */
  public record PokedexEntryGuessRevealedPokemon(String id, String name, String sprite, int generation) {

    static PokedexEntryGuessRevealedPokemon of(Pokemon pokemon) {
      return new PokedexEntryGuessRevealedPokemon(pokemon.id(), pokemon.name(), pokemon.sprite(), pokemon.generation());
    }
  }

  /** {@code PokedexEntryGuessRoundResult} (solo en el estado): la entrada completa sin enmascarar. */
  public record PokedexEntryGuessRoundResult(PokedexEntryGuessRevealedPokemon pokemon, PokedexEntry entry,
      Map<String, PokedexEntryGuessSolve> solves, Map<String, Integer> attemptCounts) {

    public PokedexEntryGuessRoundResult {
      solves = frozenMap(solves);
      attemptCounts = frozenMap(attemptCounts);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 17 campos no se usa en el motor).
   */
  public record PokedexEntryGuessState(
      GamePhase phase,
      PokedexEntryGuessConfig config,
      int referenceGeneration,
      List<String> playerIds,
      List<PokedexEntryGuessRoundTarget> roundDeck,
      int roundNumber,
      List<PokedexEntryGuessAttempt> attempts,
      Map<String, Integer> attemptCounts,
      Map<String, PokedexEntryGuessSolve> solves,
      Map<String, Long> cooldownUntil,
      Map<String, GuessLastAttempt> lastAttemptResult,
      Map<String, Integer> scores,
      Map<String, GuessPlayerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokedexEntryGuessRoundResult lastRound) implements GuessingState {

    public PokedexEntryGuessState {
      playerIds = frozenList(playerIds);
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
      return new Builder().phase(phase).config(config).referenceGeneration(referenceGeneration).playerIds(playerIds)
          .roundDeck(roundDeck).roundNumber(roundNumber).attempts(attempts).attemptCounts(attemptCounts)
          .solves(solves).cooldownUntil(cooldownUntil).lastAttemptResult(lastAttemptResult).scores(scores)
          .playerStats(playerStats).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    PokedexEntryGuessState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@code phase} y {@code config} los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokedexEntryGuessConfig config;
      private int referenceGeneration;
      private List<String> playerIds = List.of();
      private List<PokedexEntryGuessRoundTarget> roundDeck = List.of();
      private int roundNumber;
      private List<PokedexEntryGuessAttempt> attempts = List.of();
      private Map<String, Integer> attemptCounts = Map.of();
      private Map<String, PokedexEntryGuessSolve> solves = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, GuessLastAttempt> lastAttemptResult = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, GuessPlayerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private PokedexEntryGuessRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokedexEntryGuessConfig value) { config = value; return this; }

      public Builder referenceGeneration(int value) { referenceGeneration = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder roundDeck(List<PokedexEntryGuessRoundTarget> value) { roundDeck = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder attempts(List<PokedexEntryGuessAttempt> value) { attempts = value; return this; }

      public Builder attemptCounts(Map<String, Integer> value) { attemptCounts = value; return this; }

      public Builder solves(Map<String, PokedexEntryGuessSolve> value) { solves = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder lastAttemptResult(Map<String, GuessLastAttempt> value) {
        lastAttemptResult = value;
        return this;
      }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, GuessPlayerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable PokedexEntryGuessRoundResult value) { lastRound = value; return this; }

      public PokedexEntryGuessState build() {
        return new PokedexEntryGuessState(Objects.requireNonNull(phase, "phase"),
            Objects.requireNonNull(config, "config"), referenceGeneration, playerIds, roundDeck, roundNumber, attempts,
            attemptCounts, solves, cooldownUntil, lastAttemptResult, scores, playerStats, roundStartedAt, roundEndsAt,
            nextTransitionAt, lastRound);
      }
    }
  }

  /** {@code PokedexEntryGuessRoundPublicResult.pokemon}: sin id. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokedexEntryGuessPublicPokemon(String name, String sprite, int generation) {}

  /** {@code PokedexEntryGuessRoundPublicResult.entry}: texto completo, generación y versión. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokedexEntryGuessPublicEntry(String text, int generation, String versionLabel) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokedexEntryGuessRoundPublicResult(PokedexEntryGuessPublicPokemon pokemon,
      PokedexEntryGuessPublicEntry entry, Map<String, PokedexEntryGuessSolve> solves,
      Map<String, Integer> attemptCounts) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokedexEntryGuessSolvedPlayer(String playerId, int solveOrder) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokedexEntryGuessPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      int referenceGeneration,
      @Nullable String entryText,
      List<PokedexEntryGuessHint> hints,
      List<PokedexEntryGuessAttempt> attempts,
      List<PokedexEntryGuessSolvedPlayer> solvedPlayers,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokedexEntryGuessRoundPublicResult lastRound,
      @Nullable GameResults results) {}

  /** {@code attempts}: con {@code publicAttempts} apagado, solo los fallos propios de la ronda; si no, no se envía. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokedexEntryGuessPlayerState(boolean canGuess, boolean solved, @Nullable Integer solveOrder,
      @Nullable Long cooldownUntil, int roundPoints, int attemptCount,
      @Nullable GuessLastAttempt lastAttempt,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<PokedexEntryGuessAttempt> attempts) {}

  /** {@code pokedexEntryGuessActionSchema}: {@code { type: 'GUESS_POKEMON', pokemonId }} estricto, id de 1 a 96. */
  public record PokedexEntryGuessAction(String pokemonId) {

    private static final Set<String> KEYS = Set.of("type", "pokemonId");

    /** {@code z.string().min(1).max(96)} cuenta unidades UTF-16, igual que {@link String#length()}. */
    public static PokedexEntryGuessAction parse(JsonNode raw) {
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
      return new PokedexEntryGuessAction(id);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Pokédex Entry Guess no válida.");
    }
  }
}

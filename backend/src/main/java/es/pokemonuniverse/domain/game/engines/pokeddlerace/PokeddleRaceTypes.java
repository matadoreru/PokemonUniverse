package es.pokemonuniverse.domain.game.engines.pokeddlerace;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

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

/**
 * Tipos de {@code pokeddle-race/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokeddleRaceTypes {

  private PokeddleRaceTypes() {}

  /**
   * {@code PokeddleFeedbackEntry}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind}
   * primero y solo sus campos; Serde serializa el tipo concreto, sin propiedad de tipo añadida. {@code result} es el
   * literal de TS ({@code HIGHER}/{@code LOWER}/{@code MATCH}, {@code EXACT}/{@code PARTIAL}/{@code NONE}…).
   */
  public sealed interface PokeddleFeedbackEntry {

    String kind();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Numeric(String kind, int value, String result) implements PokeddleFeedbackEntry {
      Numeric(int value, String result) { this("NUMERIC", value, result); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Types(String kind, List<String> value, String result) implements PokeddleFeedbackEntry {
      public Types {
        value = frozenList(value);
      }

      Types(List<String> value, String result) { this("TYPES", value, result); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Evolution(String kind, EvolutionValue value, String result) implements PokeddleFeedbackEntry {
      Evolution(EvolutionValue value, String result) { this("EVOLUTION", value, result); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Category(String kind, String value, String result) implements PokeddleFeedbackEntry {
      Category(String value, String result) { this("CATEGORY", value, result); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Abilities(String kind, List<String> value, String result, int matches) implements PokeddleFeedbackEntry {
      public Abilities {
        value = frozenList(value);
      }

      Abilities(List<String> value, String result, int matches) { this("ABILITIES", value, result, matches); }
    }
  }

  /** {@code { stage, stages }} de la pista de evolución. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record EvolutionValue(int stage, int stages) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeddlePokemonReveal(String id, String name, String sprite) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeddleRoundGuess(String pokemonId, long submittedAt) {}

  /** {@code feedback}: {@code Partial<Record<PokeddleClueKey, PokeddleFeedbackEntry>>} en el orden de las pistas. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeddleBoardRow(int round, String status, @Nullable PokeddlePokemonReveal guessedPokemon,
      @Nullable Map<String, PokeddleFeedbackEntry> feedback, boolean correct, @Nullable Long submittedAt) {

    public PokeddleBoardRow {
      feedback = feedback == null ? null : frozenMap(feedback);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeddleSolve(int round, int validGuesses, long solvedAt) {}

  /** {@code PokeddlePlayerStats}: tres contadores contiguos, que se derivan con métodos con nombre. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeddlePlayerStats(int roundsParticipated, int validGuesses, int missedRounds) {

    /** {@code emptyStats()}. */
    public static final PokeddlePlayerStats ZERO = new PokeddlePlayerStats(0, 0, 0);

    /** Ronda con intento: {@code roundsParticipated + 1, validGuesses + 1}. */
    PokeddlePlayerStats afterGuess() {
      return new PokeddlePlayerStats(roundsParticipated + 1, validGuesses + 1, missedRounds);
    }

    /** Ronda sin intento: {@code roundsParticipated + 1, missedRounds + 1}. */
    PokeddlePlayerStats afterMissedRound() {
      return new PokeddlePlayerStats(roundsParticipated + 1, validGuesses, missedRounds + 1);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record PokeddleRaceState(
      GamePhase phase,
      PokeddleRaceConfig config,
      List<String> playerIds,
      List<String> poolIds,
      Map<String, EvolutionValue> evolutions,
      Map<String, String> secretPokemonIds,
      int roundNumber,
      Map<String, PokeddleRoundGuess> currentGuesses,
      Map<String, List<PokeddleBoardRow>> boards,
      Map<String, PokeddleSolve> solved,
      Map<String, PokeddlePlayerStats> playerStats,
      long gameStartedAt,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt) implements TimedGameState {

    public PokeddleRaceState {
      playerIds = frozenList(playerIds);
      poolIds = frozenList(poolIds);
      evolutions = frozenMap(evolutions);
      secretPokemonIds = frozenMap(secretPokemonIds);
      currentGuesses = frozenMap(currentGuesses);
      var frozenBoards = new LinkedHashMap<String, List<PokeddleBoardRow>>();
      boards.forEach((id, rows) -> frozenBoards.put(id, frozenList(rows)));
      boards = frozenMap(frozenBoards);
      solved = frozenMap(solved);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).poolIds(poolIds)
          .evolutions(evolutions).secretPokemonIds(secretPokemonIds).roundNumber(roundNumber).currentGuesses(currentGuesses).boards(boards)
          .solved(solved).playerStats(playerStats).gameStartedAt(gameStartedAt).roundStartedAt(roundStartedAt)
          .roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    PokeddleRaceState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokeddleRaceConfig config;
      private List<String> playerIds = List.of();
      private List<String> poolIds = List.of();
      /** Etapa evolutiva de cada Pokémon del pool, calculada una vez con las generaciones de la partida. */
      private Map<String, EvolutionValue> evolutions = Map.of();
      private Map<String, String> secretPokemonIds = Map.of();
      private int roundNumber;
      private Map<String, PokeddleRoundGuess> currentGuesses = Map.of();
      private Map<String, List<PokeddleBoardRow>> boards = Map.of();
      private Map<String, PokeddleSolve> solved = Map.of();
      private Map<String, PokeddlePlayerStats> playerStats = Map.of();
      private long gameStartedAt;
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokeddleRaceConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder evolutions(Map<String, EvolutionValue> value) { evolutions = value; return this; }

      public Builder secretPokemonIds(Map<String, String> value) { secretPokemonIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder currentGuesses(Map<String, PokeddleRoundGuess> value) { currentGuesses = value; return this; }

      public Builder boards(Map<String, List<PokeddleBoardRow>> value) { boards = value; return this; }

      public Builder solved(Map<String, PokeddleSolve> value) { solved = value; return this; }

      public Builder playerStats(Map<String, PokeddlePlayerStats> value) { playerStats = value; return this; }

      public Builder gameStartedAt(long value) { gameStartedAt = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public PokeddleRaceState build() {
        return new PokeddleRaceState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, poolIds, evolutions, secretPokemonIds, roundNumber, currentGuesses, boards, solved, playerStats,
            gameStartedAt, roundStartedAt, roundEndsAt, nextTransitionAt);
      }
    }
  }

  /** {@code pokeddleRaceActionSchema}: {@code { type: 'GUESS_POKEMON', pokemonId }} estricto, de 1 a 64 unidades UTF-16. */
  public record PokeddleRaceAction(String pokemonId) {

    private static final Set<String> KEYS = Set.of("type", "pokemonId");

    public static PokeddleRaceAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"GUESS_POKEMON".equals(type.getStringValue())) throw invalid();
      var pokemonId = raw.get("pokemonId");
      if (pokemonId == null || !pokemonId.isString()) throw invalid();
      var value = pokemonId.getStringValue();
      if (value.isEmpty() || value.length() > 64) throw invalid();
      return new PokeddleRaceAction(value);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Pokédle Race no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeddlePublicBoard(
      String playerId,
      List<PokeddleBoardRow> rows,
      boolean solved,
      @Nullable Integer solvedRound,
      @Nullable Long solvedAt,
      int validGuesses,
      int missedRounds,
      @Nullable PokeddlePokemonReveal revealedPokemon) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeddleRacePublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int maxRounds,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      List<String> answeredPlayerIds,
      List<String> activePlayerIds,
      Map<String, PokeddlePublicBoard> boards,
      List<String> enabledClues,
      @Nullable GameResults results) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokeddleRacePlayerState(boolean canGuess, boolean hasGuessedThisRound, boolean solved) {}
}

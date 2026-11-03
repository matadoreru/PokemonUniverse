package es.pokemonuniverse.domain.game.engines.typeduel;

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
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Tipos de {@code type-duel/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}. Los tipos Pokémon son
 * las cadenas en minúscula de {@code POKEMON_TYPES}, como en el catálogo.
 */
public final class TypeDuelTypes {

  private TypeDuelTypes() {}

  /** {@code POKEMON_TYPES} de {@code pokemon/types.ts}, en su orden. */
  public static final List<String> POKEMON_TYPES = List.of("normal", "fire", "water", "electric", "grass", "ice",
      "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy");

  /** {@code TypeDuelRoundResult['reason']}. */
  public enum TypeDuelRoundReason { WINNER, TIMEOUT, TYPE_TIMEOUT, TYPE_FORFEIT, DISCONNECTED, DISCONNECT_FORFEIT,
    INVALID_COMBINATION }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeDuelAttempt(String playerId, String pokemonId, String pokemonName, String sprite, boolean correct,
      long attemptedAt) {}

  /**
   * {@code TypeDuelStats}. Cuatro contadores contiguos: fuera de este record solo se construye con {@link #ZERO} y los
   * métodos con nombre.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeDuelStats(int duelsPlayed, int duelsWon, int correctAttempts, int incorrectAttempts,
      long correctTimeTotalMs) {

    static final TypeDuelStats ZERO = new TypeDuelStats(0, 0, 0, 0, 0);

    /** Duelo resuelto (no cancelado): suma un duelo jugado y, si es el ganador, uno ganado. */
    TypeDuelStats afterDuel(boolean won) {
      return new TypeDuelStats(duelsPlayed + 1, duelsWon + (won ? 1 : 0), correctAttempts, incorrectAttempts,
          correctTimeTotalMs);
    }

    /** Intento de Pokémon: cuenta el acierto o el fallo y, si acierta, el tiempo desde el inicio de la búsqueda. */
    TypeDuelStats afterAttempt(boolean correct, long elapsedMs) {
      return new TypeDuelStats(duelsPlayed, duelsWon, correctAttempts + (correct ? 1 : 0),
          incorrectAttempts + (correct ? 0 : 1), correctTimeTotalMs + (correct ? elapsedMs : 0));
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeDuelSolution(String id, String name, String sprite) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeDuelRoundResult(TypeDuelRoundReason reason, @Nullable String winnerId,
      List<TypeDuelAttempt> attempts, List<TypeDuelSolution> solutions, @Nullable List<String> requiredTypes,
      Map<String, String> selectedTypes, List<String> disconnectedIds) {

    public TypeDuelRoundResult {
      attempts = frozenList(attempts);
      solutions = frozenList(solutions);
      requiredTypes = requiredTypes == null ? null : frozenList(requiredTypes);
      selectedTypes = frozenMap(selectedTypes);
      disconnectedIds = frozenList(disconnectedIds);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 21 campos no se usa en el motor).
   */
  public record TypeDuelState(
      GamePhase phase,
      TypeDuelConfig config,
      List<String> playerIds,
      int completedRounds,
      int selectionCycles,
      int roundNumber,
      List<String> participants,
      Map<String, Integer> participationCounts,
      @Nullable List<String> lastPair,
      Map<String, String> typeSelections,
      @Nullable List<String> requiredTypes,
      int invalidCombinations,
      List<String> validPokemonIds,
      List<TypeDuelAttempt> attempts,
      Map<String, Long> cooldownUntil,
      Map<String, Integer> scores,
      Map<String, TypeDuelStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable TypeDuelRoundResult lastRound) implements TimedGameState {

    public TypeDuelState {
      playerIds = frozenList(playerIds);
      participants = frozenList(participants);
      participationCounts = frozenMap(participationCounts);
      lastPair = lastPair == null ? null : frozenList(lastPair);
      typeSelections = frozenMap(typeSelections);
      requiredTypes = requiredTypes == null ? null : frozenList(requiredTypes);
      validPokemonIds = frozenList(validPokemonIds);
      attempts = frozenList(attempts);
      cooldownUntil = frozenMap(cooldownUntil);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).completedRounds(completedRounds)
          .selectionCycles(selectionCycles).roundNumber(roundNumber).participants(participants)
          .participationCounts(participationCounts).lastPair(lastPair).typeSelections(typeSelections)
          .requiredTypes(requiredTypes).invalidCombinations(invalidCombinations)
          .validPokemonIds(validPokemonIds).attempts(attempts).cooldownUntil(cooldownUntil).scores(scores)
          .playerStats(playerStats).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    TypeDuelState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@code phase}, {@code config} y {@code participants} los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private TypeDuelConfig config;
      private List<String> playerIds = List.of();
      private int completedRounds;
      private int selectionCycles;
      private int roundNumber;
      private List<String> participants;
      private Map<String, Integer> participationCounts = Map.of();
      private List<String> lastPair;
      private Map<String, String> typeSelections = Map.of();
      private List<String> requiredTypes;
      private int invalidCombinations;
      private List<String> validPokemonIds = List.of();
      private List<TypeDuelAttempt> attempts = List.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, TypeDuelStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private TypeDuelRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(TypeDuelConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder completedRounds(int value) { completedRounds = value; return this; }

      public Builder selectionCycles(int value) { selectionCycles = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder participants(List<String> value) { participants = value; return this; }

      public Builder participationCounts(Map<String, Integer> value) { participationCounts = value; return this; }

      public Builder lastPair(@Nullable List<String> value) { lastPair = value; return this; }

      public Builder typeSelections(Map<String, String> value) { typeSelections = value; return this; }

      public Builder requiredTypes(@Nullable List<String> value) { requiredTypes = value; return this; }

      public Builder invalidCombinations(int value) { invalidCombinations = value; return this; }

      public Builder validPokemonIds(List<String> value) { validPokemonIds = value; return this; }

      public Builder attempts(List<TypeDuelAttempt> value) { attempts = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, TypeDuelStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable TypeDuelRoundResult value) { lastRound = value; return this; }

      public TypeDuelState build() {
        return new TypeDuelState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, completedRounds, selectionCycles, roundNumber,
            Objects.requireNonNull(participants, "participants"), participationCounts, lastPair, typeSelections,
            requiredTypes, invalidCombinations, validPokemonIds, attempts, cooldownUntil, scores, playerStats,
            roundStartedAt, roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /**
   * {@code typeDuelActionSchema}: unión discriminada por {@code type}, cada variante estricta. {@code pokemonType}
   * debe ser de {@code POKEMON_TYPES} y {@code pokemonId} tiene de 1 a 64 unidades UTF-16.
   */
  public sealed interface TypeDuelAction {

    record SelectType(String pokemonType) implements TypeDuelAction {}

    record AttemptPokemon(String pokemonId) implements TypeDuelAction {}

    record Continue() implements TypeDuelAction {}

    static TypeDuelAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "SELECT_TYPE" -> {
          strict(raw, Set.of("type", "pokemonType"));
          var value = raw.get("pokemonType");
          if (value == null || !value.isString() || !POKEMON_TYPES.contains(value.getStringValue())) throw invalid();
          yield new SelectType(value.getStringValue());
        }
        case "ATTEMPT_POKEMON" -> {
          strict(raw, Set.of("type", "pokemonId"));
          var value = raw.get("pokemonId");
          if (value == null || !value.isString()) throw invalid();
          var id = value.getStringValue();
          if (id.isEmpty() || id.length() > 64) throw invalid();
          yield new AttemptPokemon(id);
        }
        case "CONTINUE" -> {
          strict(raw, Set.of("type"));
          yield new Continue();
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
      return new ConfigValidationException("Acción de Type Duel no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeDuelPublicState(
      String gameId,
      GamePhase phase,
      List<String> playerIds,
      int completedRounds,
      int roundNumber,
      int totalRounds,
      List<String> participants,
      Map<String, Integer> participationCounts,
      List<String> typeSelectionCompletedIds,
      Map<String, String> revealedTypes,
      @Nullable List<String> requiredTypes,
      int invalidCombinations,
      boolean finalSelectionCycle,
      List<TypeDuelAttempt> attempts,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable TypeDuelRoundResult lastRound,
      @Nullable GameResults results) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeDuelPlayerState(boolean participant, @Nullable String ownType, boolean canSelectType,
      boolean canAttempt, long cooldownUntil) {}
}

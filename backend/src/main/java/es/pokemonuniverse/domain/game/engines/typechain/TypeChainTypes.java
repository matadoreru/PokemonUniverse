package es.pokemonuniverse.domain.game.engines.typechain;

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
 * Tipos de {@code type-chain/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class TypeChainTypes {

  private TypeChainTypes() {}

  public enum TypeChainInvalidReason { ALREADY_USED, NO_SHARED_TYPE, MULTIPLE_SHARED_TYPES, OUT_OF_POOL }

  /** {@code TypeChainElimination['reason']}. */
  public enum TypeChainEliminationReason { TIMEOUT, DISCONNECTED }

  /** {@code finishReason}. */
  public enum TypeChainFinishReason { SURVIVOR, MAX_TURNS }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeChainPokemonView(String id, String name, String sprite, List<String> types) {

    public TypeChainPokemonView {
      types = frozenList(types);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeChainNode(TypeChainPokemonView pokemon, @Nullable String playedBy, @Nullable String sharedType,
      int turnNumber) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeChainInvalidAttempt(String playerId, TypeChainPokemonView pokemon, TypeChainInvalidReason reason,
      long attemptedAt) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeChainElimination(String playerId, TypeChainEliminationReason reason, int turnNumber,
      long eliminatedAt, int eliminationOrder) {}

  /** {@code lastAttempt[playerId]}: {@code { reason, pokemonName, attemptedAt }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeChainLastAttempt(TypeChainInvalidReason reason, String pokemonName, long attemptedAt) {}

  /**
   * {@code TypeChainEvent}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind} primero y
   * solo sus campos; Serde serializa el tipo concreto, sin propiedad de tipo añadida.
   */
  public sealed interface TypeChainEvent {

    String kind();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Success(String kind, String playerId, TypeChainPokemonView from, TypeChainPokemonView to, String sharedType,
        long at) implements TypeChainEvent {
      Success(String playerId, TypeChainPokemonView from, TypeChainPokemonView to, String sharedType, long at) {
        this("SUCCESS", playerId, from, to, sharedType, at);
      }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Elimination(String kind, String playerId, TypeChainEliminationReason reason, long at)
        implements TypeChainEvent {
      Elimination(String playerId, TypeChainEliminationReason reason, long at) {
        this("ELIMINATION", playerId, reason, at);
      }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record ChainReset(String kind, int previousLength, TypeChainPokemonView starter, long at) implements TypeChainEvent {
      ChainReset(int previousLength, TypeChainPokemonView starter, long at) {
        this("CHAIN_RESET", previousLength, starter, at);
      }
    }
  }

  /** {@code TypeChainPlayerStats}: cuatro contadores contiguos, que se derivan con métodos con nombre. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeChainPlayerStats(int validSubmissions, int invalidAttempts, int turnsSurvived,
      int timeoutEliminations) {

    /** {@code emptyTypeChainStats()}. */
    public static final TypeChainPlayerStats ZERO = new TypeChainPlayerStats(0, 0, 0, 0);

    /** Envío válido: {@code validSubmissions + 1, turnsSurvived + 1}. */
    TypeChainPlayerStats afterValidSubmission() {
      return new TypeChainPlayerStats(validSubmissions + 1, invalidAttempts, turnsSurvived + 1, timeoutEliminations);
    }

    TypeChainPlayerStats afterInvalidAttempt() {
      return new TypeChainPlayerStats(validSubmissions, invalidAttempts + 1, turnsSurvived, timeoutEliminations);
    }

    /** {@code timeoutEliminations + (reason === 'TIMEOUT' ? 1 : 0)}. */
    TypeChainPlayerStats afterElimination(TypeChainEliminationReason reason) {
      return new TypeChainPlayerStats(validSubmissions, invalidAttempts, turnsSurvived,
          timeoutEliminations + (reason == TypeChainEliminationReason.TIMEOUT ? 1 : 0));
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record TypeChainState(
      GamePhase phase,
      TypeChainConfig config,
      List<String> playerIds,
      List<String> turnOrder,
      List<String> activePlayerIds,
      List<String> spectatorIds,
      List<String> poolIds,
      int chainNumber,
      List<TypeChainNode> chain,
      List<String> usedPokemonIds,
      int longestChain,
      int turnNumber,
      int completedTurns,
      @Nullable String currentPlayerId,
      @Nullable Long turnStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      Map<String, Long> cooldownUntil,
      List<TypeChainInvalidAttempt> invalidAttempts,
      Map<String, TypeChainLastAttempt> lastAttempt,
      List<TypeChainElimination> eliminations,
      List<TypeChainEvent> events,
      Map<String, TypeChainPlayerStats> playerStats,
      @Nullable String winnerId,
      @Nullable TypeChainFinishReason finishReason) implements TimedGameState {

    public TypeChainState {
      playerIds = frozenList(playerIds);
      turnOrder = frozenList(turnOrder);
      activePlayerIds = frozenList(activePlayerIds);
      spectatorIds = frozenList(spectatorIds);
      poolIds = frozenList(poolIds);
      chain = frozenList(chain);
      usedPokemonIds = frozenList(usedPokemonIds);
      cooldownUntil = frozenMap(cooldownUntil);
      invalidAttempts = frozenList(invalidAttempts);
      lastAttempt = frozenMap(lastAttempt);
      eliminations = frozenList(eliminations);
      events = frozenList(events);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).turnOrder(turnOrder)
          .activePlayerIds(activePlayerIds).spectatorIds(spectatorIds).poolIds(poolIds).chainNumber(chainNumber)
          .chain(chain).usedPokemonIds(usedPokemonIds).longestChain(longestChain).turnNumber(turnNumber)
          .completedTurns(completedTurns).currentPlayerId(currentPlayerId).turnStartedAt(turnStartedAt)
          .roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).cooldownUntil(cooldownUntil)
          .invalidAttempts(invalidAttempts).lastAttempt(lastAttempt).eliminations(eliminations).events(events)
          .playerStats(playerStats).winnerId(winnerId).finishReason(finishReason);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private TypeChainConfig config;
      private List<String> playerIds = List.of();
      private List<String> turnOrder = List.of();
      private List<String> activePlayerIds = List.of();
      private List<String> spectatorIds = List.of();
      private List<String> poolIds = List.of();
      private int chainNumber;
      private List<TypeChainNode> chain = List.of();
      private List<String> usedPokemonIds = List.of();
      private int longestChain;
      private int turnNumber;
      private int completedTurns;
      private String currentPlayerId;
      private Long turnStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private Map<String, Long> cooldownUntil = Map.of();
      private List<TypeChainInvalidAttempt> invalidAttempts = List.of();
      private Map<String, TypeChainLastAttempt> lastAttempt = Map.of();
      private List<TypeChainElimination> eliminations = List.of();
      private List<TypeChainEvent> events = List.of();
      private Map<String, TypeChainPlayerStats> playerStats = Map.of();
      private String winnerId;
      private TypeChainFinishReason finishReason;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(TypeChainConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder turnOrder(List<String> value) { turnOrder = value; return this; }

      public Builder activePlayerIds(List<String> value) { activePlayerIds = value; return this; }

      public Builder spectatorIds(List<String> value) { spectatorIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder chainNumber(int value) { chainNumber = value; return this; }

      public Builder chain(List<TypeChainNode> value) { chain = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder longestChain(int value) { longestChain = value; return this; }

      public Builder turnNumber(int value) { turnNumber = value; return this; }

      public Builder completedTurns(int value) { completedTurns = value; return this; }

      public Builder currentPlayerId(@Nullable String value) { currentPlayerId = value; return this; }

      public Builder turnStartedAt(@Nullable Long value) { turnStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder invalidAttempts(List<TypeChainInvalidAttempt> value) { invalidAttempts = value; return this; }

      public Builder lastAttempt(Map<String, TypeChainLastAttempt> value) { lastAttempt = value; return this; }

      public Builder eliminations(List<TypeChainElimination> value) { eliminations = value; return this; }

      public Builder events(List<TypeChainEvent> value) { events = value; return this; }

      public Builder playerStats(Map<String, TypeChainPlayerStats> value) { playerStats = value; return this; }

      public Builder winnerId(@Nullable String value) { winnerId = value; return this; }

      public Builder finishReason(@Nullable TypeChainFinishReason value) { finishReason = value; return this; }

      public TypeChainState build() {
        return new TypeChainState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, turnOrder, activePlayerIds, spectatorIds, poolIds, chainNumber, chain, usedPokemonIds,
            longestChain, turnNumber, completedTurns, currentPlayerId, turnStartedAt, roundEndsAt, nextTransitionAt,
            cooldownUntil, invalidAttempts, lastAttempt, eliminations, events, playerStats, winnerId, finishReason);
      }
    }
  }

  /** {@code typeChainActionSchema}: {@code { type: 'SUBMIT_POKEMON', pokemonId }} estricto, de 1 a 96 unidades UTF-16. */
  public record TypeChainAction(String pokemonId) {

    private static final Set<String> KEYS = Set.of("type", "pokemonId");

    public static TypeChainAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"SUBMIT_POKEMON".equals(type.getStringValue())) throw invalid();
      var pokemonId = raw.get("pokemonId");
      if (pokemonId == null || !pokemonId.isString()) throw invalid();
      var value = pokemonId.getStringValue();
      if (value.isEmpty() || value.length() > 96) throw invalid();
      return new TypeChainAction(value);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Type Chain no válida.");
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeChainPublicState(
      String gameId,
      GamePhase phase,
      List<String> turnOrder,
      List<String> activePlayerIds,
      List<String> eliminatedPlayerIds,
      @Nullable String currentPlayerId,
      @Nullable String nextPlayerId,
      int turnNumber,
      int chainNumber,
      List<TypeChainNode> chain,
      List<String> usedPokemonIds,
      int longestChain,
      @Nullable Long turnStartedAt,
      @Nullable Long roundEndsAt,
      List<TypeChainInvalidAttempt> invalidAttempts,
      List<TypeChainElimination> eliminations,
      List<TypeChainEvent> events,
      @Nullable GameResults results) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TypeChainPlayerState(boolean canSubmit, boolean isCurrentPlayer, boolean eliminated,
      @Nullable Long cooldownUntil, @Nullable TypeChainLastAttempt lastAttempt) {}
}

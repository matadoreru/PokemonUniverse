package es.pokemonuniverse.domain.game.engines.pokedexdistance;

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
 * Tipos de {@code pokedex-distance/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokedexDistanceTypes {

  private PokedexDistanceTypes() {}

  /** {@code EliminationRecord['reason']}. */
  public enum EliminationReason { FARTHEST, NO_RESPONSE }

  /** {@code RoundResult['reason']}. */
  public enum RoundReason { FARTHEST, NO_RESPONSE, TIE }

  /**
   * {@code PlayerRoundStats}. Cuatro enteros contiguos: no se construye por posición fuera de este record, solo con
   * {@link #ZERO} ({@code emptyPlayerStats}), {@link #afterSelection} y {@link #afterSurvival}.
   */
  public record PlayerRoundStats(int exactHits, int distanceTotal, int selections, int roundsSurvived) {

    static final PlayerRoundStats ZERO = new PlayerRoundStats(0, 0, 0, 0);

    /** La actualización de {@code handleAction}: la selección no cuenta como ronda superada. */
    PlayerRoundStats afterSelection(int distance) {
      return new PlayerRoundStats(exactHits + (distance == 0 ? 1 : 0), distanceTotal + distance, selections + 1,
          roundsSurvived);
    }

    /** La actualización de {@code eliminateAndContinue}: cada superviviente supera la ronda resuelta. */
    PlayerRoundStats afterSurvival() {
      return new PlayerRoundStats(exactHits, distanceTotal, selections, roundsSurvived + 1);
    }
  }

  /** {@code RoundSelection}. */
  public record RoundSelection(String pokemonId, int dexNumber, int distance, long selectedAt) {}

  /** {@code EliminationRecord}. */
  public record EliminationRecord(List<String> playerIds, EliminationReason reason, int roundNumber, int remainingAfter) {

    public EliminationRecord {
      playerIds = frozenList(playerIds);
    }
  }

  /** {@code RoundResult}. */
  public record RoundResult(int targetDexNumber, Map<String, RoundSelection> selections, List<String> eliminatedIds,
      RoundReason reason, List<String> tiedIds) {

    public RoundResult {
      selections = frozenMap(selections);
      eliminatedIds = frozenList(eliminatedIds);
      tiedIds = frozenList(tiedIds);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 20 campos no se usa en el motor).
   */
  public record PokedexDistanceState(
      GamePhase phase,
      PokedexDistanceConfig config,
      List<String> initialPlayerIds,
      List<String> survivorIds,
      List<String> spectatorIds,
      int roundNumber,
      int tiebreakDepth,
      List<String> eligibleIds,
      @Nullable Integer targetDexNumber,
      Map<String, RoundSelection> selections,
      List<String> lockedPokemonIds,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      List<String> pendingEligibleIds,
      int pendingTiebreakDepth,
      @Nullable RoundResult lastRound,
      List<EliminationRecord> eliminations,
      Map<String, PlayerRoundStats> playerStats,
      @Nullable String winnerId) implements TimedGameState {

    public PokedexDistanceState {
      initialPlayerIds = frozenList(initialPlayerIds);
      survivorIds = frozenList(survivorIds);
      spectatorIds = frozenList(spectatorIds);
      eligibleIds = frozenList(eligibleIds);
      selections = frozenMap(selections);
      lockedPokemonIds = frozenList(lockedPokemonIds);
      pendingEligibleIds = frozenList(pendingEligibleIds);
      eliminations = frozenList(eliminations);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).initialPlayerIds(initialPlayerIds).survivorIds(survivorIds)
          .spectatorIds(spectatorIds).roundNumber(roundNumber).tiebreakDepth(tiebreakDepth).eligibleIds(eligibleIds)
          .targetDexNumber(targetDexNumber).selections(selections).lockedPokemonIds(lockedPokemonIds)
          .roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt)
          .pendingEligibleIds(pendingEligibleIds).pendingTiebreakDepth(pendingTiebreakDepth).lastRound(lastRound)
          .eliminations(eliminations).playerStats(playerStats).winnerId(winnerId);
    }

    /** Listas y mapas vacíos por defecto; {@code phase} y {@code config} los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokedexDistanceConfig config;
      private List<String> initialPlayerIds = List.of();
      private List<String> survivorIds = List.of();
      private List<String> spectatorIds = List.of();
      private int roundNumber;
      private int tiebreakDepth;
      private List<String> eligibleIds = List.of();
      private Integer targetDexNumber;
      private Map<String, RoundSelection> selections = Map.of();
      private List<String> lockedPokemonIds = List.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private List<String> pendingEligibleIds = List.of();
      private int pendingTiebreakDepth;
      private RoundResult lastRound;
      private List<EliminationRecord> eliminations = List.of();
      private Map<String, PlayerRoundStats> playerStats = Map.of();
      private String winnerId;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokedexDistanceConfig value) { config = value; return this; }

      public Builder initialPlayerIds(List<String> value) { initialPlayerIds = value; return this; }

      public Builder survivorIds(List<String> value) { survivorIds = value; return this; }

      public Builder spectatorIds(List<String> value) { spectatorIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder tiebreakDepth(int value) { tiebreakDepth = value; return this; }

      public Builder eligibleIds(List<String> value) { eligibleIds = value; return this; }

      public Builder targetDexNumber(@Nullable Integer value) { targetDexNumber = value; return this; }

      public Builder selections(Map<String, RoundSelection> value) { selections = value; return this; }

      public Builder lockedPokemonIds(List<String> value) { lockedPokemonIds = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder pendingEligibleIds(List<String> value) { pendingEligibleIds = value; return this; }

      public Builder pendingTiebreakDepth(int value) { pendingTiebreakDepth = value; return this; }

      public Builder lastRound(@Nullable RoundResult value) { lastRound = value; return this; }

      public Builder eliminations(List<EliminationRecord> value) { eliminations = value; return this; }

      public Builder playerStats(Map<String, PlayerRoundStats> value) { playerStats = value; return this; }

      public Builder winnerId(@Nullable String value) { winnerId = value; return this; }

      public PokedexDistanceState build() {
        return new PokedexDistanceState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            initialPlayerIds, survivorIds, spectatorIds, roundNumber, tiebreakDepth, eligibleIds, targetDexNumber,
            selections, lockedPokemonIds, roundStartedAt, roundEndsAt, nextTransitionAt, pendingEligibleIds,
            pendingTiebreakDepth, lastRound, eliminations, playerStats, winnerId);
      }
    }
  }

  /** {@code pokedexDistanceActionSchema}: {@code { type: 'SELECT_POKEMON', pokemonId }} estricto, id de 1 a 64. */
  public record PokedexDistanceAction(String pokemonId) {

    private static final Set<String> KEYS = Set.of("type", "pokemonId");

    /** {@code z.string().min(1).max(64)} cuenta unidades UTF-16, igual que {@link String#length()}. */
    public static PokedexDistanceAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"SELECT_POKEMON".equals(type.getStringValue())) throw invalid();
      var pokemonId = raw.get("pokemonId");
      if (pokemonId == null || !pokemonId.isString()) throw invalid();
      var value = pokemonId.getStringValue();
      if (value.isEmpty() || value.length() > 64) throw invalid();
      return new PokedexDistanceAction(value);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Pokédex Distance no válida.");
    }
  }

  /** {@code PublicSelection}: la {@code RoundSelection} con nombre y sprite. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PublicSelection(String pokemonId, int dexNumber, int distance, long selectedAt, String pokemonName,
      String sprite) {}

  /** {@code PublicActiveSelection}: sin número ni distancia mientras la ronda está activa. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PublicActiveSelection(String pokemonId, long selectedAt, String pokemonName, String sprite) {}

  /** {@code PublicRoundResult['targetPokemon']}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record TargetPokemon(String id, String name, int nationalDexNumber, String sprite) {}

  /** {@code PublicRoundResult}: el {@code RoundResult} con {@code eligibleIds}, {@code targetPokemon} y selecciones ricas. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PublicRoundResult(int targetDexNumber, Map<String, PublicSelection> selections,
      List<String> eliminatedIds, RoundReason reason, List<String> tiedIds, List<String> eligibleIds,
      TargetPokemon targetPokemon) {

    public PublicRoundResult {
      selections = frozenMap(selections);
    }
  }

  /** {@code PokedexDistancePublicState}. Tres listas y dos instantes contiguos: se construye con {@link #builder()}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokedexDistancePublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int tiebreakDepth,
      @Nullable Integer targetDexNumber,
      List<String> eligibleIds,
      List<String> survivorIds,
      List<String> spectatorIds,
      Map<String, PublicActiveSelection> selections,
      List<String> selectedIds,
      List<String> lockedPokemonIds,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable PublicRoundResult lastRound,
      @Nullable String winnerId,
      @Nullable Long nextTransitionAt,
      @Nullable GameResults results) {

    public PokedexDistancePublicState {
      selections = frozenMap(selections);
    }

    static Builder builder() {
      return new Builder();
    }

    static final class Builder {
      private String gameId;
      private GamePhase phase;
      private int roundNumber;
      private int tiebreakDepth;
      private Integer targetDexNumber;
      private List<String> eligibleIds;
      private List<String> survivorIds;
      private List<String> spectatorIds;
      private Map<String, PublicActiveSelection> selections;
      private List<String> selectedIds;
      private List<String> lockedPokemonIds;
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private PublicRoundResult lastRound;
      private String winnerId;
      private GameResults results;

      private Builder() {}

      Builder gameId(String value) { gameId = value; return this; }

      Builder phase(GamePhase value) { phase = value; return this; }

      Builder roundNumber(int value) { roundNumber = value; return this; }

      Builder tiebreakDepth(int value) { tiebreakDepth = value; return this; }

      Builder targetDexNumber(@Nullable Integer value) { targetDexNumber = value; return this; }

      Builder eligibleIds(List<String> value) { eligibleIds = value; return this; }

      Builder survivorIds(List<String> value) { survivorIds = value; return this; }

      Builder spectatorIds(List<String> value) { spectatorIds = value; return this; }

      Builder selections(Map<String, PublicActiveSelection> value) { selections = value; return this; }

      Builder selectedIds(List<String> value) { selectedIds = value; return this; }

      Builder lockedPokemonIds(List<String> value) { lockedPokemonIds = value; return this; }

      Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      Builder lastRound(@Nullable PublicRoundResult value) { lastRound = value; return this; }

      Builder winnerId(@Nullable String value) { winnerId = value; return this; }

      Builder results(@Nullable GameResults value) { results = value; return this; }

      PokedexDistancePublicState build() {
        return new PokedexDistancePublicState(Objects.requireNonNull(gameId, "gameId"),
            Objects.requireNonNull(phase, "phase"), roundNumber, tiebreakDepth, targetDexNumber,
            Objects.requireNonNull(eligibleIds, "eligibleIds"), Objects.requireNonNull(survivorIds, "survivorIds"),
            Objects.requireNonNull(spectatorIds, "spectatorIds"), Objects.requireNonNull(selections, "selections"),
            Objects.requireNonNull(selectedIds, "selectedIds"),
            Objects.requireNonNull(lockedPokemonIds, "lockedPokemonIds"), roundStartedAt, roundEndsAt, lastRound,
            winnerId, nextTransitionAt, results);
      }
    }
  }

  /** {@code PokedexDistancePlayerState['selection']}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PlayerSelection(String pokemonId, long selectedAt) {}

  /** {@code PokedexDistancePlayerState}; {@code exactHit} es la confirmación privada de un acierto exacto. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokedexDistancePlayerState(boolean canSelect, @Nullable PlayerSelection selection, boolean exactHit) {}
}

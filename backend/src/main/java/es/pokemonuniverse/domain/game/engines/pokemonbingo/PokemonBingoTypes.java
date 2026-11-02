package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
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
 * Tipos de {@code pokemon-bingo/types.ts} y de {@code pokemon/conditions/types.ts}. Los {@code Record<string, …>} son
 * mapas inmutables con orden de inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con
 * {@code toBuilder()}.
 */
public final class PokemonBingoTypes {

  private PokemonBingoTypes() {}

  /** {@code BingoComparisonOperator}, más el {@code RANGE} de las condiciones de Pokédex. */
  public enum BingoOperator { GT, LT, RANGE }

  /** {@code BingoEvolutionStatus}. */
  public enum BingoEvolutionStatus { BASE, MIDDLE, FINAL, NONE }

  /** {@code BingoDifficulty} de {@code pokemon/conditions/generator.ts}. */
  public enum BingoDifficulty { EASY, MEDIUM, HARD }

  /**
   * {@code BingoCondition}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind} primero y
   * sus campos en el orden del literal TS; Serde serializa el tipo concreto, sin propiedad de tipo añadida.
   */
  public sealed interface BingoCondition {

    String kind();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Generation(String kind, int generation) implements BingoCondition {
      Generation(int generation) { this("GENERATION", generation); }
    }

    /** {@code max} es el {@code max?:} de TS: solo existe en {@code RANGE}. */
    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Dex(String kind, BingoOperator operator, int value,
        @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Integer max) implements BingoCondition {
      Dex(BingoOperator operator, int value) { this("DEX", operator, value, null); }

      static Dex range(int value, int max) { return new Dex("DEX", BingoOperator.RANGE, value, max); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Type(String kind, String pokemonType) implements BingoCondition {
      Type(String pokemonType) { this("TYPE", pokemonType); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record TypeCombination(String kind, List<String> pokemonTypes) implements BingoCondition {
      public TypeCombination {
        pokemonTypes = frozenList(pokemonTypes);
      }

      TypeCombination(List<String> pokemonTypes) { this("TYPE_COMBINATION", pokemonTypes); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record TypeCount(String kind, int count) implements BingoCondition {
      TypeCount(int count) { this("TYPE_COUNT", count); }
    }

    /** {@code stat} es la clave de TS ({@code hp}, {@code specialAttack}, {@code baseStatTotal}…). */
    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Stat(String kind, String stat, BingoOperator operator, int value) implements BingoCondition {
      Stat(String stat, BingoOperator operator, int value) { this("STAT", stat, operator, value); }
    }

    /** {@code metric} es {@code heightDecimeters} o {@code weightHectograms}. */
    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Physical(String kind, String metric, BingoOperator operator, int value) implements BingoCondition {
      Physical(String metric, BingoOperator operator, int value) { this("PHYSICAL", metric, operator, value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Evolution(String kind, BingoEvolutionStatus status) implements BingoCondition {
      Evolution(BingoEvolutionStatus status) { this("EVOLUTION", status); }
    }

    /** {@code status} es un {@code PokemonLegendaryStatus} ({@code NORMAL}, {@code LEGENDARY}, {@code MYTHICAL}). */
    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Legendary(String kind, String status) implements BingoCondition {
      Legendary(String status) { this("LEGENDARY", status); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Color(String kind, String color) implements BingoCondition {
      Color(String color) { this("COLOR", color); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Ability(String kind, String ability) implements BingoCondition {
      Ability(String ability) { this("ABILITY", ability); }
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BingoCell(String id, List<BingoCondition> conditions) {

    public BingoCell {
      conditions = frozenList(conditions);
    }
  }

  /** {@code BingoConditionTemplate} de {@code pokemon/conditions/generator.ts}. */
  public record BingoConditionTemplate(List<BingoCondition> conditions, String key, List<String> candidatePokemonIds,
      BingoDifficulty difficulty) {

    public BingoConditionTemplate {
      conditions = frozenList(conditions);
      candidatePokemonIds = frozenList(candidatePokemonIds);
    }
  }

  /** {@code GeneratedBingoBoard}. */
  public record GeneratedBingoBoard(List<BingoCell> cells, Map<String, String> solutionPokemonIds, String signature) {

    public GeneratedBingoBoard {
      cells = frozenList(cells);
      solutionPokemonIds = frozenMap(solutionPokemonIds);
    }
  }

  /** {@code BingoBoardState}; {@code solutionPokemonIds} es un emparejamiento válido que solo ve el servidor. */
  public record BingoBoardState(List<BingoCell> cells, Map<String, String> assignments,
      Map<String, String> solutionPokemonIds, long lastProgressAt) {

    public BingoBoardState {
      cells = frozenList(cells);
      assignments = frozenMap(assignments);
      solutionPokemonIds = frozenMap(solutionPokemonIds);
    }

    /** {@code { ...board, assignments, lastProgressAt }}. */
    BingoBoardState withProgress(Map<String, String> nextAssignments, long now) {
      return new BingoBoardState(cells, nextAssignments, solutionPokemonIds, now);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BingoPlayerStats(int correctAssignments, int incorrectAttempts) {

    static final BingoPlayerStats ZERO = new BingoPlayerStats(0, 0);

    BingoPlayerStats afterCorrect() {
      return new BingoPlayerStats(correctAssignments + 1, incorrectAttempts);
    }

    BingoPlayerStats afterIncorrect() {
      return new BingoPlayerStats(correctAssignments, incorrectAttempts + 1);
    }
  }

  /** {@code BingoPrivateAttempt}: tres textos contiguos, que se construyen con {@link #of}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BingoPrivateAttempt(String cellId, String pokemonId, String pokemonName, long attemptedAt,
      boolean correct, String message) {

    static BingoPrivateAttempt of(String cellId, Pokemon pokemon, long attemptedAt, boolean correct, String message) {
      return new BingoPrivateAttempt(cellId, pokemon.id(), pokemon.name(), attemptedAt, correct, message);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}.
   */
  public record PokemonBingoState(
      GamePhase phase,
      PokemonBingoConfig config,
      List<String> playerIds,
      List<String> poolIds,
      Map<String, BingoBoardState> boards,
      Map<String, BingoPlayerStats> playerStats,
      Map<String, Long> cooldownUntil,
      Map<String, BingoPrivateAttempt> lastAttempts,
      @Nullable String winnerId,
      @Nullable Long bingoAt,
      long gameStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt) implements TimedGameState {

    public PokemonBingoState {
      playerIds = frozenList(playerIds);
      poolIds = frozenList(poolIds);
      boards = frozenMap(boards);
      playerStats = frozenMap(playerStats);
      cooldownUntil = frozenMap(cooldownUntil);
      lastAttempts = frozenMap(lastAttempts);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).poolIds(poolIds).boards(boards)
          .playerStats(playerStats).cooldownUntil(cooldownUntil).lastAttempts(lastAttempts).winnerId(winnerId)
          .bingoAt(bingoAt).gameStartedAt(gameStartedAt).roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt);
    }

    /** Listas y mapas vacíos por defecto; el resto de campos obligatorios los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokemonBingoConfig config;
      private List<String> playerIds = List.of();
      private List<String> poolIds = List.of();
      private Map<String, BingoBoardState> boards = Map.of();
      private Map<String, BingoPlayerStats> playerStats = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, BingoPrivateAttempt> lastAttempts = Map.of();
      private String winnerId;
      private Long bingoAt;
      private long gameStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokemonBingoConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder boards(Map<String, BingoBoardState> value) { boards = value; return this; }

      public Builder playerStats(Map<String, BingoPlayerStats> value) { playerStats = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder lastAttempts(Map<String, BingoPrivateAttempt> value) { lastAttempts = value; return this; }

      public Builder winnerId(@Nullable String value) { winnerId = value; return this; }

      public Builder bingoAt(@Nullable Long value) { bingoAt = value; return this; }

      public Builder gameStartedAt(long value) { gameStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public PokemonBingoState build() {
        return new PokemonBingoState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, poolIds, boards, playerStats, cooldownUntil, lastAttempts, winnerId, bingoAt, gameStartedAt,
            roundEndsAt, nextTransitionAt);
      }
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BingoPokemonView(String id, String name, String sprite) {

    static BingoPokemonView of(Pokemon pokemon) {
      return new BingoPokemonView(pokemon.id(), pokemon.name(), pokemon.sprite());
    }
  }

  /** {@code BingoPublicCell}: {@code { ...cell, assignment, possibleSolutions }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BingoPublicCell(String id, List<BingoCondition> conditions, @Nullable BingoPokemonView assignment,
      List<BingoPokemonView> possibleSolutions) {

    public BingoPublicCell {
      conditions = frozenList(conditions);
      possibleSolutions = frozenList(possibleSolutions);
    }
  }

  /** {@code BingoPublicBoard}, en el orden de claves del literal de {@code publicBoard}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record BingoPublicBoard(String playerId, int completed, int total, long lastProgressAt,
      List<BingoPublicCell> cells) {

    public BingoPublicBoard {
      cells = frozenList(cells);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonBingoPublicState(
      String gameId,
      GamePhase phase,
      int width,
      int height,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable String winnerId,
      @Nullable Long bingoAt,
      Map<String, BingoPublicBoard> boards,
      @Nullable GameResults results) {

    public PokemonBingoPublicState {
      boards = frozenMap(boards);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonBingoPlayerState(boolean canAct, @Nullable Long cooldownUntil,
      @Nullable BingoPrivateAttempt lastAttempt) {}

  /**
   * {@code pokemonBingoActionSchema}: unión discriminada por {@code type}, cada variante estricta. Las longitudes son
   * en unidades UTF-16 ({@code string.length}); {@code moveExisting} es opcional, pero si viene debe ser booleano.
   */
  public sealed interface PokemonBingoAction {

    record SkipResults() implements PokemonBingoAction {}

    record AssignPokemon(String cellId, String pokemonId, boolean moveExisting) implements PokemonBingoAction {}

    record MovePokemon(String fromCellId, String toCellId) implements PokemonBingoAction {}

    record RemovePokemon(String cellId) implements PokemonBingoAction {}

    static PokemonBingoAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "SKIP_RESULTS" -> {
          strict(raw, Set.of("type"));
          yield new SkipResults();
        }
        case "ASSIGN_POKEMON" -> {
          strict(raw, Set.of("type", "cellId", "pokemonId", "moveExisting"));
          var moveExisting = raw.get("moveExisting");
          if (moveExisting != null && !moveExisting.isBoolean()) throw invalid();
          yield new AssignPokemon(id(raw, "cellId"), id(raw, "pokemonId"),
              moveExisting != null && moveExisting.getBooleanValue());
        }
        case "MOVE_POKEMON" -> {
          strict(raw, Set.of("type", "fromCellId", "toCellId"));
          yield new MovePokemon(id(raw, "fromCellId"), id(raw, "toCellId"));
        }
        case "REMOVE_POKEMON" -> {
          strict(raw, Set.of("type", "cellId"));
          yield new RemovePokemon(id(raw, "cellId"));
        }
        default -> throw invalid();
      };
    }

    /** {@code z.string().min(1).max(64)}. */
    private static String id(JsonNode raw, String key) {
      var value = raw.get(key);
      if (value == null || !value.isString()) throw invalid();
      var text = value.getStringValue();
      if (text.isEmpty() || text.length() > 64) throw invalid();
      return text;
    }

    private static void strict(JsonNode raw, Set<String> keys) {
      for (var entry : raw.entries()) {
        if (!keys.contains(entry.getKey())) throw invalid();
      }
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Pokémon Bingo no válida.");
    }
  }
}

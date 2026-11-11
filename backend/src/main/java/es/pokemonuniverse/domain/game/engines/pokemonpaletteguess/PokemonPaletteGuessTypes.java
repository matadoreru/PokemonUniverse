package es.pokemonuniverse.domain.game.engines.pokemonpaletteguess;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.GuessSolveStats;
import es.pokemonuniverse.domain.game.engine.infra.SpeedPodiumScore;
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
 * Estado, acciones y proyecciones; las proyecciones tienen su tipo TS en {@code pokemon-palette-guess/types.ts}.
 * Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokemonPaletteGuessTypes {

  private PokemonPaletteGuessTypes() {}

  /** {@code 'CORRECT' | 'INCORRECT'}. */
  public enum PokemonPaletteAttemptOutcome { CORRECT, INCORRECT }

  /** {@code PokemonPaletteGuessPlayerState['role']}. */
  public enum PokemonPaletteRole { PLAYER, SPECTATOR }

  /** {@code { id, name, sprite }} del Pokémon. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonPaletteSummary(String id, String name, String sprite) {

    static PokemonPaletteSummary of(Pokemon pokemon) {
      return new PokemonPaletteSummary(pokemon.id(), pokemon.name(), pokemon.sprite());
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonPaletteAttempt(String playerId, PokemonPaletteSummary guessedPokemon, long attemptedAt) {}

  /**
   * {@code PokemonPaletteHint}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind}
   * primero y solo sus campos; Serde serializa el tipo concreto, sin propiedad de tipo añadida.
   */
  public sealed interface PokemonPaletteHint {

    String kind();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Generation(String kind, int value) implements PokemonPaletteHint {
      Generation(int value) { this("GENERATION", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Type(String kind, List<String> values) implements PokemonPaletteHint {
      public Type {
        values = frozenList(values);
      }

      Type(List<String> values) { this("TYPE", values); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record TypeCount(String kind, int value) implements PokemonPaletteHint {
      TypeCount(int value) { this("TYPE_COUNT", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Evolution(String kind, int stage, int stages) implements PokemonPaletteHint {
      Evolution(int stage, int stages) { this("EVOLUTION", stage, stages); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Category(String kind, String value) implements PokemonPaletteHint {
      Category(String value) { this("CATEGORY", value); }
    }
  }

  /**
   * {@code PokemonPaletteSolve}. Cuatro enteros contiguos al final: solo se construye con {@link #of}, a partir de la
   * puntuación con nombre.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonPaletteSolve(int solveOrder, long solvedAt, long elapsedMs, int speedPoints, int placementBonus,
      int points, int attempts) {

    static PokemonPaletteSolve of(int solveOrder, long solvedAt, long elapsedMs, SpeedPodiumScore score,
        int attempts) {
      return new PokemonPaletteSolve(solveOrder, solvedAt, elapsedMs, score.speedPoints(), score.placementBonus(),
          score.totalPoints(), attempts);
    }
  }

  /**
   * {@code PokemonPaletteStats}. Muchos contadores contiguos: fuera de este record solo se construye con {@link #ZERO},
   * {@link #withSolve} (las mismas cuentas que el acierto de {@code server.ts}) y los métodos con nombre.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonPaletteStats(int correct, int missed, int totalAttempts, int firstTry, int roundFirsts,
      long solveTimeTotalMs, long bestTimeMs, int pointsFromRounds) implements GuessSolveStats<PokemonPaletteStats> {

    static final PokemonPaletteStats ZERO = new PokemonPaletteStats(0, 0, 0, 0, 0, 0, 0, 0);

    @Override
    public PokemonPaletteStats withSolve(int correct, int totalAttempts, int firstTry, int roundFirsts,
        long solveTimeTotalMs, long bestTimeMs, int pointsFromRounds) {
      return new PokemonPaletteStats(correct, missed, totalAttempts, firstTry, roundFirsts, solveTimeTotalMs,
          bestTimeMs, pointsFromRounds);
    }

    /** Ronda resuelta sin acierto. */
    PokemonPaletteStats afterMiss() {
      return new PokemonPaletteStats(correct, missed + 1, totalAttempts, firstTry, roundFirsts, solveTimeTotalMs,
          bestTimeMs, pointsFromRounds);
    }

    /** Intento fallido. */
    PokemonPaletteStats afterWrongAttempt() {
      return new PokemonPaletteStats(correct, missed, totalAttempts + 1, firstTry, roundFirsts, solveTimeTotalMs,
          bestTimeMs, pointsFromRounds);
    }
  }

  /** {@code lastRound.pokemon} del estado: el resumen más la generación. */
  public record PokemonPaletteTarget(String id, String name, String sprite, int generation) {}

  /** {@code PokemonPaletteRoundResult} (solo en el estado). */
  public record PokemonPaletteRoundResult(PokemonPaletteTarget pokemon, List<String> palette,
      List<Double> paletteWeights, Map<String, PokemonPaletteSolve> solves, Map<String, Integer> attemptCounts) {

    public PokemonPaletteRoundResult {
      palette = frozenList(palette);
      paletteWeights = frozenList(paletteWeights);
      solves = frozenMap(solves);
      attemptCounts = frozenMap(attemptCounts);
    }
  }

  /** {@code lastRound.pokemon} de la proyección pública: sin {@code id}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonPalettePublicTarget(String name, String sprite, int generation) {}

  /** {@code lastRound} de la proyección pública. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonPalettePublicRoundResult(PokemonPalettePublicTarget pokemon, List<String> palette,
      List<Double> paletteWeights, Map<String, PokemonPaletteSolve> solves, Map<String, Integer> attemptCounts) {

    static PokemonPalettePublicRoundResult of(PokemonPaletteRoundResult round) {
      var target = round.pokemon();
      return new PokemonPalettePublicRoundResult(
          new PokemonPalettePublicTarget(target.name(), target.sprite(), target.generation()), round.palette(),
          round.paletteWeights(), round.solves(), round.attemptCounts());
    }
  }

  /** {@code { result: 'CORRECT' | 'INCORRECT'; attemptedAt }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonPaletteLastAttempt(PokemonPaletteAttemptOutcome result, long attemptedAt) {}

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 19 campos no se usa en el motor).
   */
  public record PokemonPaletteGuessState(
      GamePhase phase,
      PokemonPaletteGuessConfig config,
      List<String> playerIds,
      List<String> poolIds,
      int roundNumber,
      @Nullable String targetPokemonId,
      List<String> usedPokemonIds,
      List<PokemonPaletteAttempt> attempts,
      Map<String, Integer> attemptCounts,
      Map<String, PokemonPaletteSolve> solves,
      Map<String, Long> cooldownUntil,
      Map<String, PokemonPaletteLastAttempt> lastAttemptResult,
      Map<String, Integer> scores,
      Map<String, PokemonPaletteStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokemonPaletteRoundResult lastRound) implements TimedGameState {

    public PokemonPaletteGuessState {
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
      return new Builder().phase(phase).config(config).playerIds(playerIds).poolIds(poolIds).roundNumber(roundNumber)
          .targetPokemonId(targetPokemonId).usedPokemonIds(usedPokemonIds).attempts(attempts)
          .attemptCounts(attemptCounts).solves(solves).cooldownUntil(cooldownUntil)
          .lastAttemptResult(lastAttemptResult).scores(scores).playerStats(playerStats)
          .roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt)
          .lastRound(lastRound);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    PokemonPaletteGuessState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@code phase} y {@code config} los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokemonPaletteGuessConfig config;
      private List<String> playerIds = List.of();
      private List<String> poolIds = List.of();
      private int roundNumber;
      private String targetPokemonId;
      private List<String> usedPokemonIds = List.of();
      private List<PokemonPaletteAttempt> attempts = List.of();
      private Map<String, Integer> attemptCounts = Map.of();
      private Map<String, PokemonPaletteSolve> solves = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, PokemonPaletteLastAttempt> lastAttemptResult = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, PokemonPaletteStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private PokemonPaletteRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokemonPaletteGuessConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder targetPokemonId(@Nullable String value) { targetPokemonId = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder attempts(List<PokemonPaletteAttempt> value) { attempts = value; return this; }

      public Builder attemptCounts(Map<String, Integer> value) { attemptCounts = value; return this; }

      public Builder solves(Map<String, PokemonPaletteSolve> value) { solves = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder lastAttemptResult(Map<String, PokemonPaletteLastAttempt> value) {
        lastAttemptResult = value;
        return this;
      }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, PokemonPaletteStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable PokemonPaletteRoundResult value) { lastRound = value; return this; }

      public PokemonPaletteGuessState build() {
        return new PokemonPaletteGuessState(Objects.requireNonNull(phase, "phase"),
            Objects.requireNonNull(config, "config"), playerIds, poolIds, roundNumber, targetPokemonId, usedPokemonIds,
            attempts, attemptCounts, solves, cooldownUntil, lastAttemptResult, scores, playerStats, roundStartedAt,
            roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonPaletteSolvedPlayer(String playerId, int solveOrder) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonPaletteGuessPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      List<String> colors,
      List<Double> colorWeights,
      List<PokemonPaletteHint> hints,
      List<PokemonPaletteAttempt> attempts,
      List<PokemonPaletteSolvedPlayer> solvedPlayers,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokemonPalettePublicRoundResult lastRound,
      @Nullable GameResults results) {}

  /** {@code attempts}: con {@code publicAttempts} apagado, solo los fallos propios de la ronda; si no, no se envía. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonPaletteGuessPlayerState(PokemonPaletteRole role, boolean canGuess, boolean solved,
      @Nullable Integer solveOrder, @Nullable Long cooldownUntil, int roundPoints, int attemptCount,
      @Nullable PokemonPaletteLastAttempt lastAttempt,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<PokemonPaletteAttempt> attempts) {}

  /** {@code pokemonPaletteGuessActionSchema}: {@code { type: 'GUESS_POKEMON', pokemonId }} estricto, id de 1 a 96. */
  public record PokemonPaletteGuessAction(String pokemonId) {

    private static final Set<String> KEYS = Set.of("type", "pokemonId");

    /** {@code z.string().min(1).max(96)} cuenta unidades UTF-16, igual que {@link String#length()}. */
    public static PokemonPaletteGuessAction parse(JsonNode raw) {
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
      return new PokemonPaletteGuessAction(id);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Adivina por la Paleta no válida.");
    }
  }
}

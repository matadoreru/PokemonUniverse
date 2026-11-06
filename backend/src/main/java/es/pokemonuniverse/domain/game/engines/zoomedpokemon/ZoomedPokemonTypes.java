package es.pokemonuniverse.domain.game.engines.zoomedpokemon;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog.Source;
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
 * Tipos de {@code zoomed-pokemon/types.ts}. {@code 'SPRITE' | 'ARTWORK'} es {@link Source} del catálogo visual. Los
 * {@code Record<string, …>} son mapas inmutables con orden de inserción ({@code Immutables.frozenMap}); cada
 * transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class ZoomedPokemonTypes {

  private ZoomedPokemonTypes() {}

  /**
   * {@code ZoomedPokemonHint}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind} primero
   * y solo sus campos; Serde serializa el tipo concreto, sin propiedad de tipo añadida.
   */
  public sealed interface ZoomedPokemonHint {

    String kind();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Generation(String kind, int value) implements ZoomedPokemonHint {
      Generation(int value) { this("GENERATION", value); }
    }

    /** {@code TYPE}: todos los tipos del Pokémon. */
    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Type(String kind, List<String> values) implements ZoomedPokemonHint {
      public Type {
        values = frozenList(values);
      }

      Type(List<String> values) { this("TYPE", values); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record TypeCount(String kind, int value) implements ZoomedPokemonHint {
      TypeCount(int value) { this("TYPE_COUNT", value); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Evolution(String kind, int stage, int stages) implements ZoomedPokemonHint {
      Evolution(int stage, int stages) { this("EVOLUTION", stage, stages); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Category(String kind, String value) implements ZoomedPokemonHint {
      Category(String value) { this("CATEGORY", value); }
    }
  }

  /** {@code 'CORRECT' | 'INCORRECT'}. */
  public enum ZoomedPokemonAttemptOutcome { CORRECT, INCORRECT }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonPokemonSummary(String id, String name, String sprite) {

    static ZoomedPokemonPokemonSummary of(Pokemon pokemon) {
      return new ZoomedPokemonPokemonSummary(pokemon.id(), pokemon.name(), pokemon.sprite());
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonAttempt(String playerId, ZoomedPokemonPokemonSummary guessedPokemon, long attemptedAt) {}

  /** Etapa de zoom del acierto: índice, aumento y bonus ({@code zoomStage}, {@code zoom}, {@code zoomBonus}). */
  public record ZoomStage(int index, double zoom, int bonus) {}

  /**
   * {@code ZoomedPokemonSolve}. Varios enteros contiguos: fuera de este record solo se construye con {@link #of}, que
   * toma la etapa como {@link ZoomStage}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonSolve(long solvedAt, long elapsedMs, int solveOrder, int zoomStage, double zoom,
      int zoomBonus, int points, int attempts) {

    static ZoomedPokemonSolve of(long solvedAt, long elapsedMs, int solveOrder, ZoomStage stage, int points,
        int attempts) {
      return new ZoomedPokemonSolve(solvedAt, elapsedMs, solveOrder, stage.index(), stage.zoom(), stage.bonus(),
          points, attempts);
    }
  }

  /**
   * {@code ZoomedPokemonPlayerStats}: doce contadores contiguos. Fuera de este record solo se construye con
   * {@link #ZERO} y los métodos con nombre.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonPlayerStats(int correct, int missed, int totalAttempts, int firstTry, int firstPositions,
      long solveTimeTotalMs, long bestTimeMs, int maxZoomSolves, int solveStageTotal, int pointsFromRounds,
      int solvesBySprite, int solvesByArtwork) {

    static final ZoomedPokemonPlayerStats ZERO = new ZoomedPokemonPlayerStats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    /** Ronda resuelta sin acierto. */
    ZoomedPokemonPlayerStats afterMiss() {
      return new ZoomedPokemonPlayerStats(correct, missed + 1, totalAttempts, firstTry, firstPositions,
          solveTimeTotalMs, bestTimeMs, maxZoomSolves, solveStageTotal, pointsFromRounds, solvesBySprite,
          solvesByArtwork);
    }

    /** Intento fallido. */
    ZoomedPokemonPlayerStats afterWrongAttempt() {
      return new ZoomedPokemonPlayerStats(correct, missed, totalAttempts + 1, firstTry, firstPositions,
          solveTimeTotalMs, bestTimeMs, maxZoomSolves, solveStageTotal, pointsFromRounds, solvesBySprite,
          solvesByArtwork);
    }

    /** Acierto, con los campos en el orden del literal de {@code handleAction}. */
    ZoomedPokemonPlayerStats afterSolve(int attemptCount, int solveOrder, long elapsedMs, int zoomStage, int points,
        Source source) {
      return new ZoomedPokemonPlayerStats(correct + 1, missed, totalAttempts + 1,
          firstTry + (attemptCount == 1 ? 1 : 0), firstPositions + (solveOrder == 1 ? 1 : 0),
          solveTimeTotalMs + elapsedMs, bestTimeMs <= 0 ? elapsedMs : Math.min(bestTimeMs, elapsedMs),
          maxZoomSolves + (zoomStage == 0 ? 1 : 0), solveStageTotal + zoomStage + 1, pointsFromRounds + points,
          solvesBySprite + (source == Source.SPRITE ? 1 : 0), solvesByArtwork + (source == Source.ARTWORK ? 1 : 0));
    }

    /** {@code { ...entry.stats }} con las claves de TS, en su orden. */
    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("correct", correct);
      mapped.put("missed", missed);
      mapped.put("totalAttempts", totalAttempts);
      mapped.put("firstTry", firstTry);
      mapped.put("firstPositions", firstPositions);
      mapped.put("solveTimeTotalMs", solveTimeTotalMs);
      mapped.put("bestTimeMs", bestTimeMs);
      mapped.put("maxZoomSolves", maxZoomSolves);
      mapped.put("solveStageTotal", solveStageTotal);
      mapped.put("pointsFromRounds", pointsFromRounds);
      mapped.put("solvesBySprite", solvesBySprite);
      mapped.put("solvesByArtwork", solvesByArtwork);
      return mapped;
    }
  }

  /** {@code ZoomedPokemonVisual} (solo en el estado): {@code location} nunca llega a la proyección. */
  public record ZoomedPokemonVisual(String pokemonId, Source source, String location, long focusSeed) {}

  /** {@code { id, name, generation }} del Pokémon revelado (solo en el estado). */
  public record ZoomedPokemonRoundPokemon(String id, String name, int generation) {}

  /** {@code ZoomedPokemonRoundResult} (solo en el estado). */
  public record ZoomedPokemonRoundResult(ZoomedPokemonRoundPokemon pokemon, Source imageSourceType,
      Map<String, ZoomedPokemonSolve> solves, Map<String, Integer> attemptCounts) {

    public ZoomedPokemonRoundResult {
      solves = frozenMap(solves);
      attemptCounts = frozenMap(attemptCounts);
    }
  }

  /** {@code { result: 'CORRECT' | 'INCORRECT'; attemptedAt }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonLastAttempt(ZoomedPokemonAttemptOutcome result, long attemptedAt) {}

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 22 campos no se usa en el motor).
   */
  public record ZoomedPokemonState(
      GamePhase phase,
      ZoomedPokemonConfig config,
      String assetToken,
      List<String> playerIds,
      List<String> poolIds,
      List<String> guessPoolIds,
      int roundNumber,
      @Nullable String targetPokemonId,
      @Nullable ZoomedPokemonVisual visual,
      List<String> usedPokemonIds,
      List<ZoomedPokemonAttempt> attempts,
      Map<String, Integer> attemptCounts,
      Map<String, ZoomedPokemonSolve> solves,
      Map<String, Long> cooldownUntil,
      Map<String, ZoomedPokemonLastAttempt> lastAttemptResult,
      Map<String, Integer> scores,
      Map<String, ZoomedPokemonPlayerStats> playerStats,
      int currentZoomStage,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable ZoomedPokemonRoundResult lastRound) implements TimedGameState {

    public ZoomedPokemonState {
      playerIds = frozenList(playerIds);
      poolIds = frozenList(poolIds);
      guessPoolIds = frozenList(guessPoolIds);
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
          .guessPoolIds(guessPoolIds).roundNumber(roundNumber).targetPokemonId(targetPokemonId).visual(visual)
          .usedPokemonIds(usedPokemonIds).attempts(attempts).attemptCounts(attemptCounts).solves(solves)
          .cooldownUntil(cooldownUntil).lastAttemptResult(lastAttemptResult).scores(scores).playerStats(playerStats)
          .currentZoomStage(currentZoomStage).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    ZoomedPokemonState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@link #build()} exige {@code phase}, {@code config} y {@code assetToken}. */
    public static final class Builder {
      private GamePhase phase;
      private ZoomedPokemonConfig config;
      private String assetToken;
      private List<String> playerIds = List.of();
      private List<String> poolIds = List.of();
      private List<String> guessPoolIds = List.of();
      private int roundNumber;
      private String targetPokemonId;
      private ZoomedPokemonVisual visual;
      private List<String> usedPokemonIds = List.of();
      private List<ZoomedPokemonAttempt> attempts = List.of();
      private Map<String, Integer> attemptCounts = Map.of();
      private Map<String, ZoomedPokemonSolve> solves = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, ZoomedPokemonLastAttempt> lastAttemptResult = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, ZoomedPokemonPlayerStats> playerStats = Map.of();
      private int currentZoomStage;
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private ZoomedPokemonRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(ZoomedPokemonConfig value) { config = value; return this; }

      public Builder assetToken(String value) { assetToken = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder guessPoolIds(List<String> value) { guessPoolIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder targetPokemonId(@Nullable String value) { targetPokemonId = value; return this; }

      public Builder visual(@Nullable ZoomedPokemonVisual value) { visual = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder attempts(List<ZoomedPokemonAttempt> value) { attempts = value; return this; }

      public Builder attemptCounts(Map<String, Integer> value) { attemptCounts = value; return this; }

      public Builder solves(Map<String, ZoomedPokemonSolve> value) { solves = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder lastAttemptResult(Map<String, ZoomedPokemonLastAttempt> value) {
        lastAttemptResult = value;
        return this;
      }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, ZoomedPokemonPlayerStats> value) { playerStats = value; return this; }

      public Builder currentZoomStage(int value) { currentZoomStage = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable ZoomedPokemonRoundResult value) { lastRound = value; return this; }

      public ZoomedPokemonState build() {
        return new ZoomedPokemonState(Objects.requireNonNull(phase, "phase"),
            Objects.requireNonNull(config, "config"), Objects.requireNonNull(assetToken, "assetToken"), playerIds,
            poolIds, guessPoolIds, roundNumber, targetPokemonId, visual, usedPokemonIds, attempts, attemptCounts,
            solves, cooldownUntil, lastAttemptResult, scores, playerStats, currentZoomStage, roundStartedAt,
            roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /** {@code focusPoint: { x: 0.5, y: 0.5 }}: el recorte ya llega centrado en el foco. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonFocusPoint(double x, double y) {

    static final ZoomedPokemonFocusPoint CENTER = new ZoomedPokemonFocusPoint(0.5, 0.5);
  }

  /** {@code Pick<ZoomedPokemonSolve, 'solveOrder' | 'zoomStage'>}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonPublicSolve(int solveOrder, int zoomStage) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonPublicPokemon(String name, int generation) {}

  /** {@code lastRound} público: rutas opacas de la revelación y del primer recorte. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonRoundPublicResult(ZoomedPokemonPublicPokemon pokemon, String imageUrl,
      String initialCropUrl, Source imageSourceType, Map<String, ZoomedPokemonSolve> solves,
      Map<String, Integer> attemptCounts) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      @Nullable String imageUrl,
      @Nullable Source imageSourceType,
      ZoomedPokemonFocusPoint focusPoint,
      List<Double> zoomStages,
      int currentZoomStage,
      int currentZoomBonus,
      List<ZoomedPokemonHint> visibleHints,
      List<ZoomedPokemonAttempt> attempts,
      Map<String, ZoomedPokemonPublicSolve> solves,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable ZoomedPokemonRoundPublicResult lastRound,
      @Nullable GameResults results) {}

  /** {@code attempts}: con {@code publicAttempts} apagado, solo los fallos propios de la ronda; si no, no se envía. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record ZoomedPokemonPlayerState(boolean canGuess, boolean solved, @Nullable Integer solveOrder,
      @Nullable Long cooldownUntil, int roundPoints, int attemptCount,
      @Nullable ZoomedPokemonLastAttempt lastAttempt,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) List<ZoomedPokemonAttempt> attempts) {}

  /** {@code zoomedPokemonActionSchema}: {@code { type: 'GUESS_POKEMON', pokemonId }} estricto, id de 1 a 96. */
  public record ZoomedPokemonAction(String pokemonId) {

    private static final Set<String> KEYS = Set.of("type", "pokemonId");

    /** {@code z.string().min(1).max(96)} cuenta unidades UTF-16, igual que {@link String#length()}. */
    public static ZoomedPokemonAction parse(JsonNode raw) {
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
      return new ZoomedPokemonAction(id);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Zoomed Pokémon no válida.");
    }
  }
}

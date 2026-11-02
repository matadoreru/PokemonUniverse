package es.pokemonuniverse.domain.game.engines.sketchmon;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.json.JsNumbers;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Tipos de {@code sketchmon/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class SketchmonTypes {

  private SketchmonTypes() {}

  /** {@code SKETCHMON_COLORS}. */
  public static final List<String> COLORS = List.of(
      "#182033", "#ffffff", "#7b8496", "#e24671", "#ef4444", "#f97316", "#e1a817",
      "#84cc16", "#27965c", "#10a6c3", "#2563eb", "#7457c7", "#d946ef", "#9a5b3c");

  /** {@code SketchmonTool}. */
  public enum SketchmonTool { PENCIL, ERASER, FILL }

  /** {@code SketchmonPoint}: coordenadas normalizadas en [0, 1]; números de JS ({@code z.number()}, no enteros). */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SketchmonPoint(double x, double y) {}

  /** {@code SketchmonStroke}. {@code color} es uno de {@link #COLORS}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SketchmonStroke(String id, SketchmonTool tool, String color, int width, List<SketchmonPoint> points) {

    public SketchmonStroke {
      points = frozenList(points);
    }

    /** {@code { ...stroke, points: [...stroke.points, ...points] }}. */
    SketchmonStroke withAppended(List<SketchmonPoint> extra) {
      var all = new ArrayList<>(points);
      all.addAll(extra);
      return new SketchmonStroke(id, tool, color, width, all);
    }
  }

  /** {@code { id, name, sprite }} del Pokémon intentado. Tres textos contiguos: solo con {@link #of}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SketchmonGuessedPokemon(String id, String name, String sprite) {

    static SketchmonGuessedPokemon of(Pokemon pokemon) {
      return new SketchmonGuessedPokemon(pokemon.id(), pokemon.name(), pokemon.sprite());
    }
  }

  /** {@code SketchmonAttempt}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SketchmonAttempt(String playerId, SketchmonGuessedPokemon guessedPokemon, long attemptedAt) {}

  /**
   * {@code SketchmonHint}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind} primero y
   * solo sus campos; Serde serializa el tipo concreto, sin propiedad de tipo añadida.
   */
  public sealed interface SketchmonHint {

    String kind();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Generation(String kind, int generation) implements SketchmonHint {
      Generation(int generation) { this("GENERATION", generation); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Types(String kind, List<String> types) implements SketchmonHint {
      public Types {
        types = frozenList(types);
      }

      Types(List<String> types) { this("TYPES", types); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Evolution(String kind, String text) implements SketchmonHint {
      Evolution(String text) { this("EVOLUTION", text); }
    }
  }

  /** {@code SketchmonPokemonReveal}. Tres textos contiguos: solo con {@link #of}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SketchmonPokemonReveal(String id, String name, String sprite, int generation, List<String> types) {

    public SketchmonPokemonReveal {
      types = frozenList(types);
    }

    static SketchmonPokemonReveal of(Pokemon pokemon) {
      return new SketchmonPokemonReveal(pokemon.id(), pokemon.name(), pokemon.sprite(), pokemon.generation(),
          pokemon.types());
    }
  }

  /** {@code SketchmonDrawerPokemon}: el sprite es {@code null} cuando termina la vista previa. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SketchmonDrawerPokemon(String name, @Nullable String sprite, @Nullable Long previewEndsAt,
      List<String> types) {

    public SketchmonDrawerPokemon {
      types = frozenList(types);
    }
  }

  /** {@code 'GUESSED' | 'TIMEOUT'}. */
  public enum SketchmonRoundReason { GUESSED, TIMEOUT }

  /**
   * {@code SketchmonRoundResult}; se proyecta tal cual en {@code lastRound}. Nueve componentes: se construye con
   * {@link #builder()}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SketchmonRoundResult(
      SketchmonRoundReason reason,
      SketchmonPokemonReveal pokemon,
      String drawerId,
      @Nullable String winnerId,
      long elapsedMs,
      int guesserPoints,
      int drawerPoints,
      @Nullable Integer winnerAttemptCount,
      List<SketchmonStroke> drawing) {

    public SketchmonRoundResult {
      drawing = frozenList(drawing);
    }

    public static Builder builder() {
      return new Builder();
    }

    public static final class Builder {
      private SketchmonRoundReason reason;
      private SketchmonPokemonReveal pokemon;
      private String drawerId;
      private String winnerId;
      private long elapsedMs;
      private int guesserPoints;
      private int drawerPoints;
      private Integer winnerAttemptCount;
      private List<SketchmonStroke> drawing = List.of();

      private Builder() {}

      public Builder reason(SketchmonRoundReason value) { reason = value; return this; }

      public Builder pokemon(SketchmonPokemonReveal value) { pokemon = value; return this; }

      public Builder drawerId(String value) { drawerId = value; return this; }

      public Builder winnerId(@Nullable String value) { winnerId = value; return this; }

      public Builder elapsedMs(long value) { elapsedMs = value; return this; }

      public Builder guesserPoints(int value) { guesserPoints = value; return this; }

      public Builder drawerPoints(int value) { drawerPoints = value; return this; }

      public Builder winnerAttemptCount(@Nullable Integer value) { winnerAttemptCount = value; return this; }

      public Builder drawing(List<SketchmonStroke> value) { drawing = value; return this; }

      public SketchmonRoundResult build() {
        return new SketchmonRoundResult(Objects.requireNonNull(reason, "reason"),
            Objects.requireNonNull(pokemon, "pokemon"), Objects.requireNonNull(drawerId, "drawerId"), winnerId,
            elapsedMs, guesserPoints, drawerPoints, winnerAttemptCount, drawing);
      }
    }
  }

  /**
   * {@code SketchmonGalleryEntry}: las claves de {@link SketchmonRoundResult} y después {@code roundNumber} y
   * {@code lapNumber}. Fuera de este record solo se construye con {@link #of}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SketchmonGalleryEntry(
      SketchmonRoundReason reason,
      SketchmonPokemonReveal pokemon,
      String drawerId,
      @Nullable String winnerId,
      long elapsedMs,
      int guesserPoints,
      int drawerPoints,
      @Nullable Integer winnerAttemptCount,
      List<SketchmonStroke> drawing,
      int roundNumber,
      int lapNumber) {

    public SketchmonGalleryEntry {
      drawing = frozenList(drawing);
    }

    /** {@code { ...lastRound, roundNumber, lapNumber }}. */
    static SketchmonGalleryEntry of(SketchmonRoundResult round, int roundNumber, int lapNumber) {
      return new SketchmonGalleryEntry(round.reason(), round.pokemon(), round.drawerId(), round.winnerId(),
          round.elapsedMs(), round.guesserPoints(), round.drawerPoints(), round.winnerAttemptCount(), round.drawing(),
          roundNumber, lapNumber);
    }
  }

  /**
   * {@code SketchmonPlayerStats}. Nueve contadores contiguos: fuera de este record solo se construye con {@link #ZERO}
   * y los métodos con nombre.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SketchmonPlayerStats(int guessedPokemon, int firstTry, int totalAttempts, int firstCorrectResponses,
      int drawingRounds, int drawingSuccesses, int drawingFailures, int pointsFromGuessing, int pointsFromDrawing) {

    /** {@code emptySketchmonStats()}. */
    static final SketchmonPlayerStats ZERO = new SketchmonPlayerStats(0, 0, 0, 0, 0, 0, 0, 0, 0);

    /** Un intento de adivinar, acertado o no. */
    SketchmonPlayerStats afterAttempt() {
      return new SketchmonPlayerStats(guessedPokemon, firstTry, totalAttempts + 1, firstCorrectResponses,
          drawingRounds, drawingSuccesses, drawingFailures, pointsFromGuessing, pointsFromDrawing);
    }

    /** Acierto de quien adivina; {@code firstAttempt} si fue su primer intento de la ronda. */
    SketchmonPlayerStats afterGuess(boolean firstAttempt, int points) {
      return new SketchmonPlayerStats(guessedPokemon + 1, firstTry + (firstAttempt ? 1 : 0), totalAttempts,
          firstCorrectResponses + 1, drawingRounds, drawingSuccesses, drawingFailures, pointsFromGuessing + points,
          pointsFromDrawing);
    }

    /** Ronda dibujada: adivinada (con sus puntos) o no; una ronda cancelada o saltada es un fallo sin puntos. */
    SketchmonPlayerStats afterDrawing(boolean guessed, int points) {
      return new SketchmonPlayerStats(guessedPokemon, firstTry, totalAttempts, firstCorrectResponses,
          drawingRounds + 1, drawingSuccesses + (guessed ? 1 : 0), drawingFailures + (guessed ? 0 : 1),
          pointsFromGuessing, pointsFromDrawing + points);
    }

    /** {@code { ...entry.stats }} con las claves de TS, en su orden. */
    Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("guessedPokemon", guessedPokemon);
      mapped.put("firstTry", firstTry);
      mapped.put("totalAttempts", totalAttempts);
      mapped.put("firstCorrectResponses", firstCorrectResponses);
      mapped.put("drawingRounds", drawingRounds);
      mapped.put("drawingSuccesses", drawingSuccesses);
      mapped.put("drawingFailures", drawingFailures);
      mapped.put("pointsFromGuessing", pointsFromGuessing);
      mapped.put("pointsFromDrawing", pointsFromDrawing);
      return mapped;
    }
  }

  /** {@code [...strokes]} congelada; cada lienzo de las pilas es una lista inmutable. */
  private static List<List<SketchmonStroke>> frozenStack(List<List<SketchmonStroke>> stack) {
    return stack.stream().map(List::copyOf).toList();
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 23 campos no se usa en el motor).
   */
  public record SketchmonState(
      GamePhase phase,
      SketchmonConfig config,
      List<String> playerIds,
      List<String> drawerOrder,
      List<String> poolIds,
      List<String> usedPokemonIds,
      int roundNumber,
      @Nullable String targetPokemonId,
      @Nullable String drawerId,
      List<SketchmonStroke> strokes,
      List<List<SketchmonStroke>> undoStack,
      List<List<SketchmonStroke>> redoStack,
      List<SketchmonHint> visibleHints,
      List<SketchmonAttempt> attempts,
      Map<String, Integer> attemptCounts,
      Map<String, Long> cooldownUntil,
      Map<String, Integer> scores,
      Map<String, SketchmonPlayerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable SketchmonRoundResult lastRound,
      List<SketchmonGalleryEntry> gallery) implements TimedGameState {

    public SketchmonState {
      playerIds = frozenList(playerIds);
      drawerOrder = frozenList(drawerOrder);
      poolIds = frozenList(poolIds);
      usedPokemonIds = frozenList(usedPokemonIds);
      strokes = frozenList(strokes);
      undoStack = frozenStack(undoStack);
      redoStack = frozenStack(redoStack);
      visibleHints = frozenList(visibleHints);
      attempts = frozenList(attempts);
      attemptCounts = frozenMap(attemptCounts);
      cooldownUntil = frozenMap(cooldownUntil);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
      gallery = frozenList(gallery);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).drawerOrder(drawerOrder).poolIds(poolIds)
          .usedPokemonIds(usedPokemonIds).roundNumber(roundNumber).targetPokemonId(targetPokemonId)
          .drawerId(drawerId).strokes(strokes).undoStack(undoStack).redoStack(redoStack).visibleHints(visibleHints)
          .attempts(attempts).attemptCounts(attemptCounts).cooldownUntil(cooldownUntil).scores(scores)
          .playerStats(playerStats).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound).gallery(gallery);
    }

    /** Listas y mapas vacíos por defecto; {@link #build()} exige {@code phase} y {@code config}. */
    public static final class Builder {
      private GamePhase phase;
      private SketchmonConfig config;
      private List<String> playerIds = List.of();
      private List<String> drawerOrder = List.of();
      private List<String> poolIds = List.of();
      private List<String> usedPokemonIds = List.of();
      private int roundNumber;
      private String targetPokemonId;
      private String drawerId;
      private List<SketchmonStroke> strokes = List.of();
      private List<List<SketchmonStroke>> undoStack = List.of();
      private List<List<SketchmonStroke>> redoStack = List.of();
      private List<SketchmonHint> visibleHints = List.of();
      private List<SketchmonAttempt> attempts = List.of();
      private Map<String, Integer> attemptCounts = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, SketchmonPlayerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private SketchmonRoundResult lastRound;
      private List<SketchmonGalleryEntry> gallery = List.of();

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(SketchmonConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder drawerOrder(List<String> value) { drawerOrder = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder usedPokemonIds(List<String> value) { usedPokemonIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder targetPokemonId(@Nullable String value) { targetPokemonId = value; return this; }

      public Builder drawerId(@Nullable String value) { drawerId = value; return this; }

      public Builder strokes(List<SketchmonStroke> value) { strokes = value; return this; }

      public Builder undoStack(List<List<SketchmonStroke>> value) { undoStack = value; return this; }

      public Builder redoStack(List<List<SketchmonStroke>> value) { redoStack = value; return this; }

      public Builder visibleHints(List<SketchmonHint> value) { visibleHints = value; return this; }

      public Builder attempts(List<SketchmonAttempt> value) { attempts = value; return this; }

      public Builder attemptCounts(Map<String, Integer> value) { attemptCounts = value; return this; }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, SketchmonPlayerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable SketchmonRoundResult value) { lastRound = value; return this; }

      public Builder gallery(List<SketchmonGalleryEntry> value) { gallery = value; return this; }

      public SketchmonState build() {
        return new SketchmonState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, drawerOrder, poolIds, usedPokemonIds, roundNumber, targetPokemonId, drawerId, strokes,
            undoStack, redoStack, visibleHints, attempts, attemptCounts, cooldownUntil, scores, playerStats,
            roundStartedAt, roundEndsAt, nextTransitionAt, lastRound, gallery);
      }
    }
  }

  /** {@code SketchmonPublicState}; se construye con {@link #builder()}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record SketchmonPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      int lapNumber,
      int totalLaps,
      @Nullable String drawerId,
      @Nullable String nextDrawerId,
      List<String> drawerOrder,
      List<SketchmonStroke> strokes,
      List<SketchmonHint> visibleHints,
      List<SketchmonAttempt> attempts,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable SketchmonRoundResult lastRound,
      List<SketchmonGalleryEntry> gallery,
      @Nullable GameResults results) {

    public static Builder builder() {
      return new Builder();
    }

    public static final class Builder {
      private String gameId;
      private GamePhase phase;
      private int roundNumber;
      private int totalRounds;
      private int lapNumber;
      private int totalLaps;
      private String drawerId;
      private String nextDrawerId;
      private List<String> drawerOrder = List.of();
      private List<SketchmonStroke> strokes = List.of();
      private List<SketchmonHint> visibleHints = List.of();
      private List<SketchmonAttempt> attempts = List.of();
      private Map<String, Integer> scores = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private SketchmonRoundResult lastRound;
      private List<SketchmonGalleryEntry> gallery = List.of();
      private GameResults results;

      private Builder() {}

      public Builder gameId(String value) { gameId = value; return this; }

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder totalRounds(int value) { totalRounds = value; return this; }

      public Builder lapNumber(int value) { lapNumber = value; return this; }

      public Builder totalLaps(int value) { totalLaps = value; return this; }

      public Builder drawerId(@Nullable String value) { drawerId = value; return this; }

      public Builder nextDrawerId(@Nullable String value) { nextDrawerId = value; return this; }

      public Builder drawerOrder(List<String> value) { drawerOrder = value; return this; }

      public Builder strokes(List<SketchmonStroke> value) { strokes = value; return this; }

      public Builder visibleHints(List<SketchmonHint> value) { visibleHints = value; return this; }

      public Builder attempts(List<SketchmonAttempt> value) { attempts = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable SketchmonRoundResult value) { lastRound = value; return this; }

      public Builder gallery(List<SketchmonGalleryEntry> value) { gallery = value; return this; }

      public Builder results(@Nullable GameResults value) { results = value; return this; }

      public SketchmonPublicState build() {
        return new SketchmonPublicState(Objects.requireNonNull(gameId, "gameId"),
            Objects.requireNonNull(phase, "phase"), roundNumber, totalRounds, lapNumber, totalLaps, drawerId,
            nextDrawerId, drawerOrder, strokes, visibleHints, attempts, scores, roundStartedAt, roundEndsAt,
            nextTransitionAt, lastRound, gallery, results);
      }
    }
  }

  /**
   * {@code SketchmonPlayerState}: unión discriminada por {@code role}. {@code SPECTATOR} no lleva más claves.
   */
  public sealed interface SketchmonPlayerState {

    String role();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Drawer(String role, boolean canDraw, @Nullable SketchmonDrawerPokemon secretPokemon)
        implements SketchmonPlayerState {
      Drawer(boolean canDraw, @Nullable SketchmonDrawerPokemon secretPokemon) {
        this("DRAWER", canDraw, secretPokemon);
      }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Guesser(String role, boolean canGuess, @Nullable Long cooldownUntil, int attemptCount)
        implements SketchmonPlayerState {
      Guesser(boolean canGuess, @Nullable Long cooldownUntil, int attemptCount) {
        this("GUESSER", canGuess, cooldownUntil, attemptCount);
      }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Spectator(String role) implements SketchmonPlayerState {
      Spectator() { this("SPECTATOR"); }
    }
  }

  /** Operación de un {@code DRAW_BATCH}: {@code START} con un trazo nuevo o {@code APPEND} a uno existente. */
  public sealed interface SketchmonDrawOperation {

    /** {@code strokeStartSchema}. */
    record Start(SketchmonStroke stroke) implements SketchmonDrawOperation {}

    /** {@code strokeAppendSchema}. */
    record Append(String strokeId, List<SketchmonPoint> points) implements SketchmonDrawOperation {
      public Append {
        points = frozenList(points);
      }
    }

    /** Número de puntos que aporta la operación. */
    default int pointCount() {
      return switch (this) {
        case Start start -> start.stroke().points().size();
        case Append append -> append.points().size();
      };
    }
  }

  /** {@code sketchmonActionSchema}: unión discriminada por {@code type}; cada objeto es {@code .strict()}. */
  public sealed interface SketchmonAction {

    record DrawBatch(List<SketchmonDrawOperation> operations) implements SketchmonAction {
      public DrawBatch {
        operations = frozenList(operations);
      }
    }

    record UndoStroke() implements SketchmonAction {}

    record RedoStroke() implements SketchmonAction {}

    record ClearDrawing() implements SketchmonAction {}

    record GuessPokemon(String pokemonId) implements SketchmonAction {}

    /**
     * {@code strokeIdSchema}: {@code ^[a-zA-Z0-9_-]+$} sobre toda la cadena; {@code matches} evita el {@code $} de
     * Java, que admitiría un salto de línea final.
     */
    Pattern STROKE_ID = Pattern.compile("[a-zA-Z0-9_-]+");
    int MAX_OPERATIONS = 8;
    int MAX_POINTS_PER_OPERATION = 32;

    static SketchmonAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "DRAW_BATCH" -> {
          strict(raw, Set.of("type", "operations"));
          var operations = raw.get("operations");
          if (operations == null || !operations.isArray()) throw invalid();
          if (operations.size() < 1 || operations.size() > MAX_OPERATIONS) throw invalid();
          var parsed = new ArrayList<SketchmonDrawOperation>();
          for (var operation : operations.values()) parsed.add(operation(operation));
          yield new DrawBatch(parsed);
        }
        case "UNDO_STROKE" -> {
          strict(raw, Set.of("type"));
          yield new UndoStroke();
        }
        case "REDO_STROKE" -> {
          strict(raw, Set.of("type"));
          yield new RedoStroke();
        }
        case "CLEAR_DRAWING" -> {
          strict(raw, Set.of("type"));
          yield new ClearDrawing();
        }
        case "GUESS_POKEMON" -> {
          strict(raw, Set.of("type", "pokemonId"));
          yield new GuessPokemon(string(raw, "pokemonId", 1, 96));
        }
        default -> throw invalid();
      };
    }

    private static SketchmonDrawOperation operation(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var kind = raw.get("kind");
      if (kind == null || !kind.isString()) throw invalid();
      return switch (kind.getStringValue()) {
        case "START" -> {
          strict(raw, Set.of("kind", "stroke"));
          yield new SketchmonDrawOperation.Start(stroke(raw.get("stroke")));
        }
        case "APPEND" -> {
          strict(raw, Set.of("kind", "strokeId", "points"));
          yield new SketchmonDrawOperation.Append(strokeId(raw, "strokeId"), points(raw.get("points")));
        }
        default -> throw invalid();
      };
    }

    private static SketchmonStroke stroke(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      strict(raw, Set.of("id", "tool", "color", "width", "points"));
      var id = strokeId(raw, "id");
      var tool = raw.get("tool");
      if (tool == null || !tool.isString()) throw invalid();
      var toolValue = switch (tool.getStringValue()) {
        case "PENCIL" -> SketchmonTool.PENCIL;
        case "ERASER" -> SketchmonTool.ERASER;
        case "FILL" -> SketchmonTool.FILL;
        default -> throw invalid();
      };
      var color = raw.get("color");
      if (color == null || !color.isString() || !COLORS.contains(color.getStringValue())) throw invalid();
      var width = raw.get("width");
      if (width == null || !width.isNumber()) throw invalid();
      double widthValue = width.getDoubleValue();
      if (!JsNumbers.isSafeInteger(widthValue) || widthValue < 2 || widthValue > 32) throw invalid();
      return new SketchmonStroke(id, toolValue, color.getStringValue(), (int) widthValue, points(raw.get("points")));
    }

    /** {@code z.array(pointSchema).min(1).max(32)}. */
    private static List<SketchmonPoint> points(JsonNode raw) {
      if (raw == null || !raw.isArray()) throw invalid();
      if (raw.size() < 1 || raw.size() > MAX_POINTS_PER_OPERATION) throw invalid();
      var points = new ArrayList<SketchmonPoint>();
      for (var point : raw.values()) {
        if (point == null || !point.isObject()) throw invalid();
        strict(point, Set.of("x", "y"));
        points.add(new SketchmonPoint(coordinate(point.get("x")), coordinate(point.get("y"))));
      }
      return points;
    }

    /** {@code z.number().min(0).max(1)}: cualquier número finito en el intervalo, no solo enteros. */
    private static double coordinate(JsonNode raw) {
      if (raw == null || !raw.isNumber()) throw invalid();
      double value = raw.getDoubleValue();
      if (!Double.isFinite(value) || value < 0 || value > 1) throw invalid();
      return value;
    }

    private static String strokeId(JsonNode raw, String key) {
      var id = string(raw, key, 1, 64);
      if (!STROKE_ID.matcher(id).matches()) throw invalid();
      return id;
    }

    /** {@code z.string().min(min).max(max)}, en unidades UTF-16 como {@code String.length}. */
    private static String string(JsonNode raw, String key, int min, int max) {
      var value = raw.get(key);
      if (value == null || !value.isString()) throw invalid();
      var text = value.getStringValue();
      if (text.length() < min || text.length() > max) throw invalid();
      return text;
    }

    private static void strict(JsonNode raw, Set<String> keys) {
      for (var entry : raw.entries()) {
        if (!keys.contains(entry.getKey())) throw invalid();
      }
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Sketchmon no válida.");
    }
  }
}

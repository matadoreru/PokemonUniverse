package es.pokemonuniverse.domain.game.engines.whoami;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
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
 * Tipos de {@code who-am-i/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class WhoAmITypes {

  private WhoAmITypes() {}

  /** {@code WHO_AM_I_ANSWERS}: Sí, No, A medias y No lo sé. */
  public enum WhoAmIAnswer { YES, NO, PARTLY, UNKNOWN }

  /** Paso del turno activo: pregunta, respuestas y decisión (adivinar o pasar). */
  public enum WhoAmITurnStep { ASKING, ANSWERING, DECIDING }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoAmIPokemon(String id, String name, String sprite, int nationalDexNumber, List<String> types) {

    public WhoAmIPokemon {
      types = frozenList(types);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoAmIAnswerEntry(String playerId, WhoAmIAnswer answer) {}

  /**
   * {@code WhoAmIHistoryEntry}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind}
   * primero y solo sus campos; Serde serializa el tipo concreto, sin propiedad de tipo añadida. La pregunta entra en
   * el historial del que pregunta cuando termina su turno, sea cual sea el motivo.
   */
  public sealed interface WhoAmIHistoryEntry {

    String kind();

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Question(String kind, String text, List<WhoAmIAnswerEntry> answers) implements WhoAmIHistoryEntry {
      public Question {
        answers = frozenList(answers);
      }

      public Question(String text, List<WhoAmIAnswerEntry> answers) { this("QUESTION", text, answers); }
    }

    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Guess(String kind, WhoAmIPokemon pokemon) implements WhoAmIHistoryEntry {
      public Guess(WhoAmIPokemon pokemon) { this("GUESS", pokemon); }
    }
  }

  /** Pregunta en curso del jugador del turno (proyección pública): solo en {@code ANSWERING} y {@code DECIDING}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoAmICurrentQuestion(String text, List<WhoAmIAnswerEntry> answers, List<String> answeredPlayerIds) {

    public WhoAmICurrentQuestion {
      answers = frozenList(answers);
      answeredPlayerIds = frozenList(answeredPlayerIds);
    }
  }

  /** Pregunta en curso dentro del estado: el texto y las respuestas en orden de llegada. */
  public record WhoAmIOpenQuestion(String text, List<WhoAmIAnswerEntry> answers) {

    public WhoAmIOpenQuestion {
      answers = frozenList(answers);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoAmIResultEntry(String playerId, WhoAmIPokemon pokemon, boolean solved, int questionsAsked,
      int points, int rank) {}

  /**
   * {@code WhoAmIPlayerStats}: seis contadores contiguos. Fuera de este record solo se construye con {@link #ZERO} y
   * los métodos con nombre.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoAmIPlayerStats(int gamesPlayed, int solved, int questionsAsked, int wrongGuesses, int firstSolves,
      int pointsFromRounds) {

    public static final WhoAmIPlayerStats ZERO = new WhoAmIPlayerStats(0, 0, 0, 0, 0, 0);

    /** Estadísticas de una partida terminada, sumadas a estas. */
    public WhoAmIPlayerStats afterGame(boolean wasSolved, int asked, int wrong, boolean first, int points) {
      return new WhoAmIPlayerStats(gamesPlayed + 1, solved + (wasSolved ? 1 : 0), questionsAsked + asked,
          wrongGuesses + wrong, firstSolves + (first ? 1 : 0), pointsFromRounds + points);
    }

    /** {@code { ...entry.stats }} con las claves de TS, en su orden. */
    public Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("gamesPlayed", gamesPlayed);
      mapped.put("solved", solved);
      mapped.put("questionsAsked", questionsAsked);
      mapped.put("wrongGuesses", wrongGuesses);
      mapped.put("firstSolves", firstSolves);
      mapped.put("pointsFromRounds", pointsFromRounds);
      return mapped;
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}. {@code assignments} es jugador a Pokémon (interno); {@code lap} y {@code turnIndex} sitúan
   * el turno; {@code currentQuestion}, {@code turnStep} y {@code roundEndsAt} (el {@code turnEndsAt} público) son
   * nulos fuera del turno activo.
   */
  public record WhoAmIState(
      GamePhase phase,
      WhoAmIConfig config,
      List<String> playerIds,
      Map<String, WhoAmIPokemon> assignments,
      int lap,
      int turnIndex,
      @Nullable WhoAmITurnStep turnStep,
      @Nullable WhoAmIOpenQuestion currentQuestion,
      Map<String, List<WhoAmIHistoryEntry>> history,
      List<String> solvedPlayerIds,
      Map<String, Integer> questionsAsked,
      Map<String, Integer> wrongGuesses,
      Map<String, Integer> scores,
      Map<String, WhoAmIPlayerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt) implements TimedGameState {

    public WhoAmIState {
      playerIds = frozenList(playerIds);
      assignments = frozenMap(assignments);
      history = frozenMap(history);
      solvedPlayerIds = frozenList(solvedPlayerIds);
      questionsAsked = frozenMap(questionsAsked);
      wrongGuesses = frozenMap(wrongGuesses);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).assignments(assignments).lap(lap)
          .turnIndex(turnIndex).turnStep(turnStep).currentQuestion(currentQuestion).history(history)
          .solvedPlayerIds(solvedPlayerIds).questionsAsked(questionsAsked).wrongGuesses(wrongGuesses)
          .scores(scores).playerStats(playerStats).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt);
    }

    /** Listas y mapas vacíos por defecto; {@link #build()} exige {@code phase} y {@code config}. */
    public static final class Builder {
      private GamePhase phase;
      private WhoAmIConfig config;
      private List<String> playerIds = List.of();
      private Map<String, WhoAmIPokemon> assignments = Map.of();
      private int lap = 1;
      private int turnIndex;
      private WhoAmITurnStep turnStep;
      private WhoAmIOpenQuestion currentQuestion;
      private Map<String, List<WhoAmIHistoryEntry>> history = Map.of();
      private List<String> solvedPlayerIds = List.of();
      private Map<String, Integer> questionsAsked = Map.of();
      private Map<String, Integer> wrongGuesses = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, WhoAmIPlayerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(WhoAmIConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder assignments(Map<String, WhoAmIPokemon> value) { assignments = value; return this; }

      public Builder lap(int value) { lap = value; return this; }

      public Builder turnIndex(int value) { turnIndex = value; return this; }

      public Builder turnStep(@Nullable WhoAmITurnStep value) { turnStep = value; return this; }

      public Builder currentQuestion(@Nullable WhoAmIOpenQuestion value) { currentQuestion = value; return this; }

      public Builder history(Map<String, List<WhoAmIHistoryEntry>> value) { history = value; return this; }

      public Builder solvedPlayerIds(List<String> value) { solvedPlayerIds = value; return this; }

      public Builder questionsAsked(Map<String, Integer> value) { questionsAsked = value; return this; }

      public Builder wrongGuesses(Map<String, Integer> value) { wrongGuesses = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, WhoAmIPlayerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public WhoAmIState build() {
        return new WhoAmIState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, assignments, lap, turnIndex, turnStep, currentQuestion, history, solvedPlayerIds,
            questionsAsked, wrongGuesses, scores, playerStats, roundStartedAt, roundEndsAt, nextTransitionAt);
      }
    }
  }

  /**
   * {@code WhoAmIPublicState}: lo que ve cualquiera de la sala; no lleva ningún Pokémon de los jugadores hasta
   * {@code GAME_RESULTS}. {@code turnEndsAt} es el {@code roundEndsAt} del estado.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoAmIPublicState(
      String gameId,
      GamePhase phase,
      int lap,
      int maxLaps,
      List<String> playerIds,
      @Nullable String turnPlayerId,
      @Nullable WhoAmITurnStep turnStep,
      @Nullable WhoAmICurrentQuestion currentQuestion,
      Map<String, List<WhoAmIHistoryEntry>> history,
      List<String> solvedPlayerIds,
      Map<String, Integer> questionsAsked,
      Map<String, Integer> scores,
      @Nullable Long turnEndsAt,
      @Nullable List<WhoAmIResultEntry> results) {

    public WhoAmIPublicState {
      playerIds = frozenList(playerIds);
      history = frozenMap(history);
      solvedPlayerIds = frozenList(solvedPlayerIds);
      questionsAsked = frozenMap(questionsAsked);
      scores = frozenMap(scores);
      results = results == null ? null : frozenList(results);
    }

    public static Builder builder() {
      return new Builder();
    }

    /** Listas y mapas vacíos por defecto; {@link #build()} exige {@code gameId} y {@code phase}. */
    public static final class Builder {
      private String gameId;
      private GamePhase phase;
      private int lap = 1;
      private int maxLaps;
      private List<String> playerIds = List.of();
      private String turnPlayerId;
      private WhoAmITurnStep turnStep;
      private WhoAmICurrentQuestion currentQuestion;
      private Map<String, List<WhoAmIHistoryEntry>> history = Map.of();
      private List<String> solvedPlayerIds = List.of();
      private Map<String, Integer> questionsAsked = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Long turnEndsAt;
      private List<WhoAmIResultEntry> results;

      private Builder() {}

      public Builder gameId(String value) { gameId = value; return this; }

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder lap(int value) { lap = value; return this; }

      public Builder maxLaps(int value) { maxLaps = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder turnPlayerId(@Nullable String value) { turnPlayerId = value; return this; }

      public Builder turnStep(@Nullable WhoAmITurnStep value) { turnStep = value; return this; }

      public Builder currentQuestion(@Nullable WhoAmICurrentQuestion value) { currentQuestion = value; return this; }

      public Builder history(Map<String, List<WhoAmIHistoryEntry>> value) { history = value; return this; }

      public Builder solvedPlayerIds(List<String> value) { solvedPlayerIds = value; return this; }

      public Builder questionsAsked(Map<String, Integer> value) { questionsAsked = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder turnEndsAt(@Nullable Long value) { turnEndsAt = value; return this; }

      public Builder results(@Nullable List<WhoAmIResultEntry> value) { results = value; return this; }

      public WhoAmIPublicState build() {
        return new WhoAmIPublicState(Objects.requireNonNull(gameId, "gameId"),
            Objects.requireNonNull(phase, "phase"), lap, maxLaps, playerIds, turnPlayerId, turnStep, currentQuestion,
            history, solvedPlayerIds, questionsAsked, scores, turnEndsAt, results);
      }
    }
  }

  /**
   * {@code WhoAmIPlayerState}: {@code role} {@code PLAYER} o {@code SPECTATOR}. El espectador lleva todos los permisos
   * a {@code false}, sin {@code self} ni respuesta y {@code others} con todos los jugadores; una sola forma se
   * serializa igual que la unión de TS. El rol {@code SPECTATOR} es solo para ids que no están en {@code playerIds}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record WhoAmIPlayerState(String role, Map<String, WhoAmIPokemon> others, @Nullable WhoAmIPokemon self,
      boolean canAsk, boolean canAnswer, boolean canGuess, boolean canPass, @Nullable WhoAmIAnswer ownAnswer) {

    public WhoAmIPlayerState {
      others = frozenMap(others);
    }

    public static WhoAmIPlayerState player(Map<String, WhoAmIPokemon> others, @Nullable WhoAmIPokemon self,
        boolean canAsk, boolean canAnswer, boolean canGuess, boolean canPass, @Nullable WhoAmIAnswer ownAnswer) {
      return new WhoAmIPlayerState("PLAYER", others, self, canAsk, canAnswer, canGuess, canPass, ownAnswer);
    }

    public static WhoAmIPlayerState spectator(Map<String, WhoAmIPokemon> others) {
      return new WhoAmIPlayerState("SPECTATOR", others, null, false, false, false, false, null);
    }
  }

  /**
   * {@code whoAmIActionSchema}: unión por {@code type}, cada variante estricta. El texto de la pregunta se recorta con
   * el {@code trim} de JS y las longitudes cuentan unidades UTF-16.
   */
  public sealed interface WhoAmIAction {

    record Ask(String text) implements WhoAmIAction {}

    record Answer(WhoAmIAnswer answer) implements WhoAmIAction {}

    record GuessSelf(String pokemonId) implements WhoAmIAction {}

    record Pass() implements WhoAmIAction {}

    static WhoAmIAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      var type = raw.get("type");
      if (type == null || !type.isString()) throw invalid();
      return switch (type.getStringValue()) {
        case "ASK_QUESTION" -> {
          strictKeys(raw, Set.of("type", "text"));
          var value = raw.get("text");
          if (value == null || !value.isString()) throw invalid();
          var text = JsStrings.trim(value.getStringValue());
          if (text.isEmpty()) throw new ConfigValidationException("Escribe una pregunta antes de enviarla.");
          if (text.length() > WhoAmIRules.MAX_QUESTION_LENGTH) {
            throw new ConfigValidationException(
                "La pregunta no puede superar " + WhoAmIRules.MAX_QUESTION_LENGTH + " caracteres.");
          }
          yield new Ask(text);
        }
        case "ANSWER_QUESTION" -> {
          strictKeys(raw, Set.of("type", "answer"));
          var value = raw.get("answer");
          if (value == null || !value.isString()) throw invalid();
          try {
            yield new Answer(WhoAmIAnswer.valueOf(value.getStringValue()));
          } catch (IllegalArgumentException unknown) {
            throw invalid();
          }
        }
        case "GUESS_SELF" -> {
          strictKeys(raw, Set.of("type", "pokemonId"));
          var value = raw.get("pokemonId");
          if (value == null || !value.isString()) throw invalid();
          var id = value.getStringValue();
          if (id.isEmpty() || id.length() > 96) throw invalid();
          yield new GuessSelf(id);
        }
        case "PASS_TURN" -> {
          strictKeys(raw, Set.of("type"));
          yield new Pass();
        }
        default -> throw invalid();
      };
    }

    private static void strictKeys(JsonNode raw, Set<String> allowed) {
      for (var entry : raw.entries()) {
        if (!allowed.contains(entry.getKey())) throw invalid();
      }
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de ¿Quién soy? no válida.");
    }
  }
}

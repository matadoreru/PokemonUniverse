package es.pokemonuniverse.domain.game.engines.unowntranslator;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.GuessingState;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Estado, acciones y proyecciones; las proyecciones tienen su tipo TS en {@code unown-translator/types.ts}.
 * Los {@code Record<string, …>} son mapas inmutables con orden de
 * inserción ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class UnownTranslatorTypes {

  private static final Set<String> ACTION_KEYS = Set.of("type", "text");

  private UnownTranslatorTypes() {}

  /**
   * {@code UnownToken}: unión discriminada por {@code kind}. Cada variante es un record con {@code kind} primero y solo
   * sus campos; Serde serializa el tipo concreto, sin propiedad de tipo añadida.
   */
  public sealed interface UnownToken {

    String kind();

    /** Glifo todavía oculto. */
    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Glyph(String kind, int glyph) implements UnownToken {
      public Glyph(int glyph) { this("GLYPH", glyph); }
    }

    /** Glifo ya traducido a su letra. */
    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Letter(String kind, int glyph, String letter) implements UnownToken {
      public Letter(int glyph, String letter) { this("LETTER", glyph, letter); }
    }

    /** Carácter que no se cifra (espacio, punto, número, símbolo). */
    @Serdeable
    @JsonInclude(JsonInclude.Include.ALWAYS)
    record Literal(String kind, String text) implements UnownToken {
      public Literal(String text) { this("LITERAL", text); }
    }
  }

  /** {@code 'CORRECT' | 'INCORRECT'}. */
  public enum UnownTranslatorAttemptOutcome { CORRECT, INCORRECT }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record UnownAlphabetEntry(int glyph, String letter) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record UnownTranslatorPokemon(String id, String name, String sprite, int nationalDexNumber,
      List<String> types) {

    public UnownTranslatorPokemon {
      types = frozenList(types);
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record UnownTranslatorMove(String name, String type, String category) {}

  /**
   * Mensaje ya elegido (solo en el estado): nunca sale en una proyección de {@code ROUND_ACTIVE}. {@code text} es el
   * texto tal cual se muestra al revelarlo y {@code normalized} su forma normalizada; en {@code CLASSIC} lleva
   * {@code pokemon} (copiado del catálogo al construir el mazo, para que la revelación no dependa de volver a buscarlo)
   * y en {@code MOVES} lleva {@code move}.
   */
  public record UnownMessage(String text, String normalized, @Nullable UnownTranslatorPokemon pokemon,
      @Nullable UnownTranslatorMove move) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record UnownTranslatorSolve(String playerId, int points, int hiddenLetters, long solvedAt) {}

  /** {@code { outcome: 'CORRECT' | 'INCORRECT'; at }}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record UnownTranslatorLastAttempt(UnownTranslatorAttemptOutcome outcome, long at) {}

  /** {@code UnownTranslatorRoundResult}: sin piezas, porque glifo y letra juntos de todo el mensaje darían la clave. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record UnownTranslatorRoundResult(
      UnownTranslatorMode mode,
      String answer,
      @Nullable UnownTranslatorPokemon pokemon,
      @Nullable UnownTranslatorMove move,
      List<UnownTranslatorSolve> solves,
      List<String> missingPlayerIds) {

    public UnownTranslatorRoundResult {
      solves = frozenList(solves);
      missingPlayerIds = frozenList(missingPlayerIds);
    }
  }

  /**
   * {@code UnownTranslatorPlayerStats}: seis contadores contiguos. Fuera de este record solo se construye con
   * {@link #ZERO} y los métodos con nombre.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record UnownTranslatorPlayerStats(int roundsPlayed, int solved, int missed, int firstSolves,
      int hiddenLettersAtSolve, int pointsFromRounds) {

    public static final UnownTranslatorPlayerStats ZERO = new UnownTranslatorPlayerStats(0, 0, 0, 0, 0, 0);

    /** Ronda resuelta sin acierto. */
    public UnownTranslatorPlayerStats afterMiss() {
      return new UnownTranslatorPlayerStats(roundsPlayed + 1, solved, missed + 1, firstSolves, hiddenLettersAtSolve,
          pointsFromRounds);
    }

    /** Acierto: {@code first} si fue el primero de la ronda. */
    public UnownTranslatorPlayerStats afterSolve(boolean first, int hiddenLetters, int points) {
      return new UnownTranslatorPlayerStats(roundsPlayed + 1, solved + 1, missed, firstSolves + (first ? 1 : 0),
          hiddenLettersAtSolve + hiddenLetters, pointsFromRounds + points);
    }

    /** {@code { ...entry.stats }} con las claves de TS, en su orden. */
    public Map<String, Number> toMap() {
      var mapped = new LinkedHashMap<String, Number>();
      mapped.put("roundsPlayed", roundsPlayed);
      mapped.put("solved", solved);
      mapped.put("missed", missed);
      mapped.put("firstSolves", firstSolves);
      mapped.put("hiddenLettersAtSolve", hiddenLettersAtSolve);
      mapped.put("pointsFromRounds", pointsFromRounds);
      return mapped;
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()}. {@code key} es la clave del cifrado (26 glifos, uno por letra) y {@code alphabet} las letras
   * descubiertas en la ronda (las iniciales y las pistas), en orden de descubrimiento; se vacía al empezar cada ronda.
   */
  public record UnownTranslatorState(
      GamePhase phase,
      UnownTranslatorConfig config,
      List<String> playerIds,
      List<Integer> key,
      List<UnownMessage> messages,
      int roundNumber,
      List<String> alphabet,
      int hintsGiven,
      Map<String, UnownTranslatorSolve> solves,
      Map<String, Integer> attemptCounts,
      Map<String, UnownTranslatorLastAttempt> lastAttemptResult,
      Map<String, Long> cooldownUntil,
      Map<String, Integer> scores,
      Map<String, UnownTranslatorPlayerStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable UnownTranslatorRoundResult lastRound) implements GuessingState {

    public UnownTranslatorState {
      playerIds = frozenList(playerIds);
      key = frozenList(key);
      messages = frozenList(messages);
      alphabet = frozenList(alphabet);
      solves = frozenMap(solves);
      attemptCounts = frozenMap(attemptCounts);
      lastAttemptResult = frozenMap(lastAttemptResult);
      cooldownUntil = frozenMap(cooldownUntil);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).key(key).messages(messages)
          .roundNumber(roundNumber).alphabet(alphabet).hintsGiven(hintsGiven).solves(solves)
          .attemptCounts(attemptCounts).lastAttemptResult(lastAttemptResult).cooldownUntil(cooldownUntil)
          .scores(scores).playerStats(playerStats).roundStartedAt(roundStartedAt).roundEndsAt(roundEndsAt)
          .nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** {@code { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }}. */
    public UnownTranslatorState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).roundEndsAt(null).nextTransitionAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@link #build()} exige {@code phase} y {@code config}. */
    public static final class Builder {
      private GamePhase phase;
      private UnownTranslatorConfig config;
      private List<String> playerIds = List.of();
      private List<Integer> key = List.of();
      private List<UnownMessage> messages = List.of();
      private int roundNumber;
      private List<String> alphabet = List.of();
      private int hintsGiven;
      private Map<String, UnownTranslatorSolve> solves = Map.of();
      private Map<String, Integer> attemptCounts = Map.of();
      private Map<String, UnownTranslatorLastAttempt> lastAttemptResult = Map.of();
      private Map<String, Long> cooldownUntil = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, UnownTranslatorPlayerStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private UnownTranslatorRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(UnownTranslatorConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder key(List<Integer> value) { key = value; return this; }

      public Builder messages(List<UnownMessage> value) { messages = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder alphabet(List<String> value) { alphabet = value; return this; }

      public Builder hintsGiven(int value) { hintsGiven = value; return this; }

      public Builder solves(Map<String, UnownTranslatorSolve> value) { solves = value; return this; }

      public Builder attemptCounts(Map<String, Integer> value) { attemptCounts = value; return this; }

      public Builder lastAttemptResult(Map<String, UnownTranslatorLastAttempt> value) {
        lastAttemptResult = value;
        return this;
      }

      public Builder cooldownUntil(Map<String, Long> value) { cooldownUntil = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, UnownTranslatorPlayerStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable UnownTranslatorRoundResult value) { lastRound = value; return this; }

      public UnownTranslatorState build() {
        return new UnownTranslatorState(Objects.requireNonNull(phase, "phase"),
            Objects.requireNonNull(config, "config"), playerIds, key, messages, roundNumber, alphabet, hintsGiven,
            solves, attemptCounts, lastAttemptResult, cooldownUntil, scores, playerStats, roundStartedAt,
            roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  /** {@code UnownTranslatorPublicState}: lo que ve cualquiera de la sala. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record UnownTranslatorPublicState(
      String gameId,
      GamePhase phase,
      UnownTranslatorMode mode,
      int roundNumber,
      int totalRounds,
      List<String> playerIds,
      List<UnownToken> tokens,
      List<UnownAlphabetEntry> alphabet,
      List<String> solvedPlayerIds,
      Map<String, Integer> roundPointsByPlayer,
      Map<String, Integer> scores,
      @Nullable Long roundEndsAt,
      @Nullable Long nextHintAt,
      @Nullable Long nextTransitionAt,
      @Nullable UnownTranslatorRoundResult lastRound,
      @Nullable GameResults results) {

    public UnownTranslatorPublicState {
      playerIds = frozenList(playerIds);
      tokens = frozenList(tokens);
      alphabet = frozenList(alphabet);
      solvedPlayerIds = frozenList(solvedPlayerIds);
      roundPointsByPlayer = frozenMap(roundPointsByPlayer);
      scores = frozenMap(scores);
    }

    public static Builder builder() {
      return new Builder();
    }

    /** Listas y mapas vacíos por defecto; {@link #build()} exige {@code gameId}, {@code phase} y {@code mode}. */
    public static final class Builder {
      private String gameId;
      private GamePhase phase;
      private UnownTranslatorMode mode;
      private int roundNumber = 0;
      private int totalRounds = 0;
      private List<String> playerIds = List.of();
      private List<UnownToken> tokens = List.of();
      private List<UnownAlphabetEntry> alphabet = List.of();
      private List<String> solvedPlayerIds = List.of();
      private Map<String, Integer> roundPointsByPlayer = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Long roundEndsAt;
      private Long nextHintAt;
      private Long nextTransitionAt;
      private UnownTranslatorRoundResult lastRound;
      private GameResults results;

      private Builder() {}

      public Builder gameId(String value) { gameId = value; return this; }

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder mode(UnownTranslatorMode value) { mode = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder totalRounds(int value) { totalRounds = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder tokens(List<UnownToken> value) { tokens = value; return this; }

      public Builder alphabet(List<UnownAlphabetEntry> value) { alphabet = value; return this; }

      public Builder solvedPlayerIds(List<String> value) { solvedPlayerIds = value; return this; }

      public Builder roundPointsByPlayer(Map<String, Integer> value) { roundPointsByPlayer = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextHintAt(@Nullable Long value) { nextHintAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable UnownTranslatorRoundResult value) { lastRound = value; return this; }

      public Builder results(@Nullable GameResults value) { results = value; return this; }

      public UnownTranslatorPublicState build() {
        return new UnownTranslatorPublicState(Objects.requireNonNull(gameId, "gameId"),
            Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(mode, "mode"), roundNumber, totalRounds,
            playerIds, tokens, alphabet, solvedPlayerIds, roundPointsByPlayer, scores, roundEndsAt, nextHintAt,
            nextTransitionAt, lastRound, results);
      }
    }
  }

  /**
   * {@code UnownTranslatorPlayerState}: unión por {@code role}. El espectador lleva siempre
   * {@code canGuess: false}, {@code solved: false}, sin respuesta, sin bloqueo, 0 intentos y sin último intento; una
   * sola forma con esos valores se serializa igual.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record UnownTranslatorPlayerState(String role, boolean canGuess, boolean solved, @Nullable String answer,
      @Nullable Long cooldownUntil, int attemptCount, @Nullable UnownTranslatorLastAttempt lastAttempt) {

    public static UnownTranslatorPlayerState player(boolean canGuess, boolean solved, @Nullable String answer,
        @Nullable Long cooldownUntil, int attemptCount, @Nullable UnownTranslatorLastAttempt lastAttempt) {
      return new UnownTranslatorPlayerState("PLAYER", canGuess, solved, answer, cooldownUntil, attemptCount,
          lastAttempt);
    }

    public static UnownTranslatorPlayerState spectator() {
      return new UnownTranslatorPlayerState("SPECTATOR", false, false, null, null, 0, null);
    }
  }

  /**
   * {@code unownTranslatorActionSchema}: {@code { type: 'GUESS_UNOWN', text }} estricto. El texto se recorta con el
   * {@code trim} de JS y la acción lleva el texto recortado; las longitudes cuentan unidades UTF-16.
   */
  public sealed interface UnownTranslatorAction {

    record Guess(String text) implements UnownTranslatorAction {}

    static UnownTranslatorAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!ACTION_KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"GUESS_UNOWN".equals(type.getStringValue())) throw invalid();
      var value = raw.get("text");
      if (value == null || !value.isString()) throw invalid();
      var text = JsStrings.trim(value.getStringValue());
      if (text.isEmpty()) throw new ConfigValidationException("Escribe una respuesta antes de enviarla.");
      if (text.length() > UnownTranslatorRules.MAX_GUESS_LENGTH) {
        throw new ConfigValidationException(
            "La respuesta no puede superar " + UnownTranslatorRules.MAX_GUESS_LENGTH + " caracteres.");
      }
      return new Guess(text);
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Traductor Unown no válida.");
    }
  }
}

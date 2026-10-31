package es.pokemonuniverse.domain.game.engines.pokemontrivia;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;
import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import com.fasterxml.jackson.annotation.JsonInclude;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.infra.TimedGameState;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaConfig.PokemonTriviaDifficulty;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaConfig.PokemonTriviaQuestionType;
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
 * Tipos de {@code pokemon-trivia/types.ts}. Los {@code Record<string, …>} son mapas inmutables con orden de inserción
 * ({@code Immutables.frozenMap}); cada transición crea un estado nuevo con {@code toBuilder()}.
 */
public final class PokemonTriviaTypes {

  private PokemonTriviaTypes() {}

  /** {@code POKEMON_TRIVIA_OPTION_IDS}. */
  public enum PokemonTriviaOptionId { A, B, C, D }

  /** {@code PokemonTriviaPlayerState['role']}. */
  public enum PokemonTriviaRole { PLAYER, SPECTATOR }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonTriviaOptionPokemon(String id, String name, String sprite) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonTriviaOption(PokemonTriviaOptionId id, PokemonTriviaOptionPokemon pokemon) {}

  /** {@code PokemonTriviaQuestion} (solo en el estado). */
  public record PokemonTriviaQuestion(String key, PokemonTriviaQuestionType type, String prompt,
      List<PokemonTriviaOption> options, PokemonTriviaOptionId correctOptionId, String fact) {

    public PokemonTriviaQuestion {
      options = frozenList(options);
    }
  }

  /**
   * {@code PokemonTriviaOptionDetails}. {@code heightDecimeters}/{@code weightHectograms} son opcionales en TS; el
   * record {@link Pokemon} Java siempre los trae, así que siempre se emiten. Solo se construye con {@link #of}.
   */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonTriviaOptionDetails(int nationalDexNumber, int generation, List<String> types, int hp,
      int attack, int defense, int specialAttack, int specialDefense, int speed, int baseStatTotal,
      int heightDecimeters, int weightHectograms) {

    public PokemonTriviaOptionDetails {
      types = frozenList(types);
    }

    static PokemonTriviaOptionDetails of(Pokemon pokemon) {
      return new PokemonTriviaOptionDetails(pokemon.nationalDexNumber(), pokemon.generation(), pokemon.types(),
          pokemon.hp(), pokemon.attack(), pokemon.defense(), pokemon.specialAttack(), pokemon.specialDefense(),
          pokemon.speed(), pokemon.baseStatTotal(), pokemon.heightDecimeters(), pokemon.weightHectograms());
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonTriviaAnswer(PokemonTriviaOptionId optionId, long answeredAt) {}

  /** {@code optionDetails} se indexa por id de opción ({@code A}…{@code D}) en el orden de las opciones. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonTriviaRoundResult(PokemonTriviaOptionId correctOptionId, String fact,
      Map<String, PokemonTriviaAnswer> answers, Map<String, Integer> points,
      Map<String, PokemonTriviaOptionDetails> optionDetails) {

    public PokemonTriviaRoundResult {
      answers = frozenMap(answers);
      points = frozenMap(points);
      optionDetails = frozenMap(optionDetails);
    }
  }

  /**
   * {@code PokemonTriviaStats} (solo en el estado). Los contadores por categoría se indexan por el nombre del tipo de
   * pregunta en el orden de {@code POKEMON_TRIVIA_QUESTION_TYPES}. Solo se construye con {@link #empty()} y
   * {@link #afterRound}.
   */
  public record PokemonTriviaStats(int answers, int correct, int incorrect, int unanswered, long fastestCorrectMs,
      long correctTimeTotalMs, int pointsFromRounds, Map<String, Integer> categoryAnswers,
      Map<String, Integer> categoryCorrect) {

    public PokemonTriviaStats {
      categoryAnswers = frozenMap(categoryAnswers);
      categoryCorrect = frozenMap(categoryCorrect);
    }

    /** {@code emptyPokemonTriviaStats}. */
    static PokemonTriviaStats empty() {
      var categories = new LinkedHashMap<String, Integer>();
      for (var type : PokemonTriviaQuestionType.values()) categories.put(type.name(), 0);
      return new PokemonTriviaStats(0, 0, 0, 0, 0, 0, 0, categories, categories);
    }

    /** La actualización de {@code revealRound} para una ronda de tipo {@code type}. */
    PokemonTriviaStats afterRound(PokemonTriviaQuestionType type, boolean answered, boolean wasCorrect,
        long elapsedMs, int earned) {
      var nextAnswers = new LinkedHashMap<>(categoryAnswers);
      nextAnswers.put(type.name(), categoryAnswers.get(type.name()) + (answered ? 1 : 0));
      var nextCorrect = new LinkedHashMap<>(categoryCorrect);
      nextCorrect.put(type.name(), categoryCorrect.get(type.name()) + (wasCorrect ? 1 : 0));
      return new PokemonTriviaStats(
          answers + (answered ? 1 : 0),
          correct + (wasCorrect ? 1 : 0),
          incorrect + (answered && !wasCorrect ? 1 : 0),
          unanswered + (answered ? 0 : 1),
          wasCorrect ? (fastestCorrectMs <= 0 ? elapsedMs : Math.min(fastestCorrectMs, elapsedMs)) : fastestCorrectMs,
          correctTimeTotalMs + (wasCorrect ? elapsedMs : 0),
          pointsFromRounds + earned,
          nextAnswers,
          nextCorrect);
    }
  }

  /**
   * Estado opaco del servidor; nunca se serializa hacia los clientes. Se construye solo con {@link #builder()} o
   * {@link #toBuilder()} (setters con nombre: el constructor posicional de 15 campos no se usa en el motor).
   */
  public record PokemonTriviaState(
      GamePhase phase,
      PokemonTriviaConfig config,
      List<String> playerIds,
      List<String> poolIds,
      int roundNumber,
      @Nullable PokemonTriviaQuestion question,
      List<String> usedQuestionKeys,
      List<PokemonTriviaQuestionType> recentQuestionTypes,
      Map<String, PokemonTriviaAnswer> answers,
      Map<String, Integer> scores,
      Map<String, PokemonTriviaStats> playerStats,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokemonTriviaRoundResult lastRound) implements TimedGameState {

    public PokemonTriviaState {
      playerIds = frozenList(playerIds);
      poolIds = frozenList(poolIds);
      usedQuestionKeys = frozenList(usedQuestionKeys);
      recentQuestionTypes = frozenList(recentQuestionTypes);
      answers = frozenMap(answers);
      scores = frozenMap(scores);
      playerStats = frozenMap(playerStats);
    }

    public static Builder builder() {
      return new Builder();
    }

    public Builder toBuilder() {
      return new Builder().phase(phase).config(config).playerIds(playerIds).poolIds(poolIds).roundNumber(roundNumber)
          .question(question).usedQuestionKeys(usedQuestionKeys).recentQuestionTypes(recentQuestionTypes)
          .answers(answers).scores(scores).playerStats(playerStats).roundStartedAt(roundStartedAt)
          .roundEndsAt(roundEndsAt).nextTransitionAt(nextTransitionAt).lastRound(lastRound);
    }

    /** {@code finish}: {@code { ...state, phase: 'GAME_RESULTS', nextTransitionAt: null, roundEndsAt: null }}. */
    PokemonTriviaState finished() {
      return toBuilder().phase(GamePhase.GAME_RESULTS).nextTransitionAt(null).roundEndsAt(null).build();
    }

    /** Listas y mapas vacíos por defecto; {@code phase} y {@code config} los valida {@link #build()}. */
    public static final class Builder {
      private GamePhase phase;
      private PokemonTriviaConfig config;
      private List<String> playerIds = List.of();
      private List<String> poolIds = List.of();
      private int roundNumber;
      private PokemonTriviaQuestion question;
      private List<String> usedQuestionKeys = List.of();
      private List<PokemonTriviaQuestionType> recentQuestionTypes = List.of();
      private Map<String, PokemonTriviaAnswer> answers = Map.of();
      private Map<String, Integer> scores = Map.of();
      private Map<String, PokemonTriviaStats> playerStats = Map.of();
      private Long roundStartedAt;
      private Long roundEndsAt;
      private Long nextTransitionAt;
      private PokemonTriviaRoundResult lastRound;

      private Builder() {}

      public Builder phase(GamePhase value) { phase = value; return this; }

      public Builder config(PokemonTriviaConfig value) { config = value; return this; }

      public Builder playerIds(List<String> value) { playerIds = value; return this; }

      public Builder poolIds(List<String> value) { poolIds = value; return this; }

      public Builder roundNumber(int value) { roundNumber = value; return this; }

      public Builder question(@Nullable PokemonTriviaQuestion value) { question = value; return this; }

      public Builder usedQuestionKeys(List<String> value) { usedQuestionKeys = value; return this; }

      public Builder recentQuestionTypes(List<PokemonTriviaQuestionType> value) {
        recentQuestionTypes = value;
        return this;
      }

      public Builder answers(Map<String, PokemonTriviaAnswer> value) { answers = value; return this; }

      public Builder scores(Map<String, Integer> value) { scores = value; return this; }

      public Builder playerStats(Map<String, PokemonTriviaStats> value) { playerStats = value; return this; }

      public Builder roundStartedAt(@Nullable Long value) { roundStartedAt = value; return this; }

      public Builder roundEndsAt(@Nullable Long value) { roundEndsAt = value; return this; }

      public Builder nextTransitionAt(@Nullable Long value) { nextTransitionAt = value; return this; }

      public Builder lastRound(@Nullable PokemonTriviaRoundResult value) { lastRound = value; return this; }

      public PokemonTriviaState build() {
        return new PokemonTriviaState(Objects.requireNonNull(phase, "phase"), Objects.requireNonNull(config, "config"),
            playerIds, poolIds, roundNumber, question, usedQuestionKeys, recentQuestionTypes, answers, scores,
            playerStats, roundStartedAt, roundEndsAt, nextTransitionAt, lastRound);
      }
    }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonTriviaPublicState(
      String gameId,
      GamePhase phase,
      int roundNumber,
      int totalRounds,
      PokemonTriviaDifficulty difficulty,
      @Nullable String prompt,
      @Nullable PokemonTriviaQuestionType questionType,
      List<PokemonTriviaOption> options,
      List<String> answeredPlayerIds,
      Map<String, Integer> scores,
      @Nullable Long roundStartedAt,
      @Nullable Long roundEndsAt,
      @Nullable Long nextTransitionAt,
      @Nullable PokemonTriviaRoundResult lastRound,
      @Nullable GameResults results) {}

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  public record PokemonTriviaPlayerState(PokemonTriviaRole role, boolean canAnswer,
      @Nullable PokemonTriviaAnswer answer) {}

  /** {@code pokemonTriviaActionSchema}: {@code { type: 'ANSWER', optionId: 'A' | 'B' | 'C' | 'D' }} estricto. */
  public record PokemonTriviaAction(PokemonTriviaOptionId optionId) {

    private static final Set<String> KEYS = Set.of("type", "optionId");

    public static PokemonTriviaAction parse(JsonNode raw) {
      if (raw == null || !raw.isObject()) throw invalid();
      for (var entry : raw.entries()) {
        if (!KEYS.contains(entry.getKey())) throw invalid();
      }
      var type = raw.get("type");
      if (type == null || !type.isString() || !"ANSWER".equals(type.getStringValue())) throw invalid();
      var optionId = raw.get("optionId");
      if (optionId == null || !optionId.isString()) throw invalid();
      for (var value : PokemonTriviaOptionId.values()) {
        if (value.name().equals(optionId.getStringValue())) return new PokemonTriviaAction(value);
      }
      throw invalid();
    }

    private static ConfigValidationException invalid() {
      return new ConfigValidationException("Acción de Pokémon Trivia no válida.");
    }
  }
}

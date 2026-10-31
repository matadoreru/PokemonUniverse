package es.pokemonuniverse.domain.game.engines.pokemontrivia;

import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Configuración normalizada ({@code pokemonTriviaConfigSchema} de {@code pokemon-trivia/config.ts}). El esquema es
 * {@code .strict()}: una clave desconocida invalida la configuración. {@code questionTypes} no se deduplica.
 */
@Serdeable
public record PokemonTriviaConfig(
    List<Integer> generations,
    int roundSeconds,
    int rounds,
    int optionCount,
    PokemonTriviaDifficulty difficulty,
    List<PokemonTriviaQuestionType> questionTypes) {

  /** {@code GENERATIONS} de {@code pokemon/types.ts}. */
  static final int FIRST_GENERATION = 1;
  static final int LAST_GENERATION = 9;

  private static final Set<String> KEYS =
      Set.of("generations", "roundSeconds", "rounds", "optionCount", "difficulty", "questionTypes");

  public PokemonTriviaConfig {
    generations = List.copyOf(generations);
    questionTypes = List.copyOf(questionTypes);
  }

  /** {@code POKEMON_TRIVIA_QUESTION_TYPES}, en su orden. */
  public enum PokemonTriviaQuestionType {
    TYPE, GENERATION, HP, ATTACK, DEFENSE, SPECIAL_ATTACK, SPECIAL_DEFENSE, SPEED, BST, HEIGHT, WEIGHT, DEX_NUMBER
  }

  /** {@code POKEMON_TRIVIA_DIFFICULTIES}. */
  public enum PokemonTriviaDifficulty { EASY, NORMAL, HARD }

  /** {@code defaultPokemonTriviaConfig}. */
  public static PokemonTriviaConfig defaults() {
    var generations = new ArrayList<Integer>();
    for (int generation = FIRST_GENERATION; generation <= LAST_GENERATION; generation++) generations.add(generation);
    return new PokemonTriviaConfig(generations, 20, 10, 4, PokemonTriviaDifficulty.NORMAL,
        Arrays.asList(PokemonTriviaQuestionType.values()));
  }

  /**
   * {@code pokemonTriviaConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code questionTypes} de 1 a 12 entradas tal cual (sin deduplicar). {@code superRefine}: las preguntas solo de
   * generación necesitan al menos dos generaciones.
   */
  public static PokemonTriviaConfig parse(JsonNode raw) {
    if (raw == null || !raw.isObject()) throw invalid("la configuración debe ser un objeto");
    for (var entry : raw.entries()) {
      if (!KEYS.contains(entry.getKey())) throw invalid("clave desconocida " + entry.getKey());
    }
    var generationsNode = required(raw, "generations");
    if (!generationsNode.isArray() || generationsNode.size() < 1) {
      throw invalid("generations debe ser una lista con al menos una generación");
    }
    var generations = new TreeSet<Integer>();
    for (var value : generationsNode.values()) {
      generations.add(integer(value, "generations", FIRST_GENERATION, LAST_GENERATION));
    }
    int roundSeconds = integer(required(raw, "roundSeconds"), "roundSeconds", 10, 60);
    int rounds = integer(required(raw, "rounds"), "rounds", 1, 30);
    int optionCount = integer(required(raw, "optionCount"), "optionCount", 3, 4);
    var difficulty = enumValue(required(raw, "difficulty"), "difficulty", PokemonTriviaDifficulty.class);
    var typesNode = required(raw, "questionTypes");
    int maxTypes = PokemonTriviaQuestionType.values().length;
    if (!typesNode.isArray() || typesNode.size() < 1 || typesNode.size() > maxTypes) {
      throw invalid("questionTypes debe tener entre 1 y " + maxTypes + " tipos");
    }
    var questionTypes = new ArrayList<PokemonTriviaQuestionType>();
    for (var value : typesNode.values()) {
      questionTypes.add(enumValue(value, "questionTypes", PokemonTriviaQuestionType.class));
    }
    if (questionTypes.size() == 1 && questionTypes.getFirst() == PokemonTriviaQuestionType.GENERATION
        && generations.size() < 2) {
      throw invalid("Las preguntas de generación necesitan al menos dos generaciones");
    }
    return new PokemonTriviaConfig(new ArrayList<>(generations), roundSeconds, rounds, optionCount, difficulty,
        questionTypes);
  }

  private static JsonNode required(JsonNode raw, String key) {
    var value = raw.get(key);
    if (value == null) throw invalid("falta " + key);
    return value;
  }

  /** {@code z.number().int().min(min).max(max)}. */
  private static int integer(JsonNode value, String key, int min, int max) {
    if (!value.isNumber()) throw invalid(key + " debe ser un número entero");
    double number = value.getDoubleValue();
    if (number != Math.rint(number) || Double.isInfinite(number)) throw invalid(key + " debe ser un número entero");
    if (number < min || number > max) throw invalid(key + " debe estar entre " + min + " y " + max);
    return (int) number;
  }

  /** {@code z.enum([...])}: solo cadenas con un valor exacto del enum. */
  private static <E extends Enum<E>> E enumValue(JsonNode value, String key, Class<E> type) {
    if (value.isString()) {
      for (var constant : type.getEnumConstants()) {
        if (constant.name().equals(value.getStringValue())) return constant;
      }
    }
    throw invalid(key + " tiene un valor no válido");
  }

  private static ConfigValidationException invalid(String detail) {
    return new ConfigValidationException("Configuración de Pokémon Trivia no válida: " + detail + ".");
  }
}

package es.pokemonuniverse.domain.game.engines.pokemontrivia;

import es.pokemonuniverse.domain.game.engine.infra.ConfigReader;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.annotation.Serdeable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

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
    var generations = ConfigReader.allGenerations();
    return new PokemonTriviaConfig(generations, 20, 10, 4, PokemonTriviaDifficulty.NORMAL,
        Arrays.asList(PokemonTriviaQuestionType.values()));
  }

  /**
   * {@code pokemonTriviaConfigSchema.parse}: objeto estricto; {@code generations} sin duplicados y ascendentes;
   * {@code questionTypes} de 1 a 12 entradas tal cual (sin deduplicar). {@code superRefine}: las preguntas solo de
   * generación necesitan al menos dos generaciones.
   */
  public static PokemonTriviaConfig parse(JsonNode raw) {
    var config = ConfigReader.of(raw, "Pokémon Trivia");
    config.strict(KEYS);
    var generations = config.generations("generations");
    int roundSeconds = config.integer("roundSeconds", 10, 60);
    int rounds = config.integer("rounds", 1, 30);
    int optionCount = config.integer("optionCount", 3, 4);
    var difficulty = config.enumValue("difficulty", PokemonTriviaDifficulty.class);
    var typesNode = config.required("questionTypes");
    int maxTypes = PokemonTriviaQuestionType.values().length;
    if (!typesNode.isArray() || typesNode.size() < 1 || typesNode.size() > maxTypes) {
      throw config.invalid("questionTypes debe tener entre 1 y " + maxTypes + " tipos");
    }
    var questionTypes = new ArrayList<PokemonTriviaQuestionType>();
    for (var value : typesNode.values()) {
      questionTypes.add(config.enumValue(value, "questionTypes", PokemonTriviaQuestionType.class));
    }
    if (questionTypes.size() == 1 && questionTypes.getFirst() == PokemonTriviaQuestionType.GENERATION
        && generations.size() < 2) {
      throw config.invalid("Las preguntas de generación necesitan al menos dos generaciones");
    }
    return new PokemonTriviaConfig(generations, roundSeconds, rounds, optionCount, difficulty, questionTypes);
  }
}

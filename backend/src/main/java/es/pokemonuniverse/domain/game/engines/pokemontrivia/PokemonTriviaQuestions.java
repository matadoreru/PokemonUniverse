package es.pokemonuniverse.domain.game.engines.pokemontrivia;

import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.infra.Randoms;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaConfig.PokemonTriviaDifficulty;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaConfig.PokemonTriviaQuestionType;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaOption;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaOptionId;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaOptionPokemon;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaQuestion;
import es.pokemonuniverse.domain.game.engines.pokemontrivia.PokemonTriviaTypes.PokemonTriviaState;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import io.micronaut.core.annotation.Nullable;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.DoubleSupplier;
import java.util.function.IntFunction;
import java.util.function.ToIntFunction;

/**
 * Generación de preguntas de {@code pokemon-trivia/server.ts} ({@code createPokemonTriviaQuestion} y sus ayudantes),
 * separada del motor. Consume {@code random} en el mismo orden que el TS: orden de tipos, objetivos, discriminador,
 * distractores y orden de opciones. Los literales de {@code prompt} y {@code fact} son los del TS, tildes incluidas.
 */
final class PokemonTriviaQuestions {

  private PokemonTriviaQuestions() {}

  /** {@code typeLabels}. */
  private static final Map<String, String> TYPE_LABELS = Map.ofEntries(
      Map.entry("normal", "Normal"), Map.entry("fire", "Fuego"), Map.entry("water", "Agua"),
      Map.entry("electric", "Eléctrico"), Map.entry("grass", "Planta"), Map.entry("ice", "Hielo"),
      Map.entry("fighting", "Lucha"), Map.entry("poison", "Veneno"), Map.entry("ground", "Tierra"),
      Map.entry("flying", "Volador"), Map.entry("psychic", "Psíquico"), Map.entry("bug", "Bicho"),
      Map.entry("rock", "Roca"), Map.entry("ghost", "Fantasma"), Map.entry("dragon", "Dragón"),
      Map.entry("dark", "Siniestro"), Map.entry("steel", "Acero"), Map.entry("fairy", "Hada"));

  /** Entrada de {@code numericQuestions}: enunciado, valor (0 si falta) y dato de la respuesta. */
  private record NumericQuestion(String prompt, ToIntFunction<Pokemon> value, IntFunction<String> fact) {}

  private static final Map<PokemonTriviaQuestionType, NumericQuestion> NUMERIC_QUESTIONS = Map.ofEntries(
      Map.entry(PokemonTriviaQuestionType.HP,
          new NumericQuestion("¿Cuál tiene más PS base?", Pokemon::hp, value -> "PS base " + value)),
      Map.entry(PokemonTriviaQuestionType.ATTACK,
          new NumericQuestion("¿Cuál tiene mayor Ataque base?", Pokemon::attack, value -> "Ataque base " + value)),
      Map.entry(PokemonTriviaQuestionType.DEFENSE,
          new NumericQuestion("¿Cuál tiene mayor Defensa base?", Pokemon::defense, value -> "Defensa base " + value)),
      Map.entry(PokemonTriviaQuestionType.SPECIAL_ATTACK,
          new NumericQuestion("¿Cuál tiene mayor Ataque Especial base?", Pokemon::specialAttack,
              value -> "Ataque Especial base " + value)),
      Map.entry(PokemonTriviaQuestionType.SPECIAL_DEFENSE,
          new NumericQuestion("¿Cuál tiene mayor Defensa Especial base?", Pokemon::specialDefense,
              value -> "Defensa Especial base " + value)),
      Map.entry(PokemonTriviaQuestionType.BST,
          new NumericQuestion("¿Cuál tiene el mayor total de estadísticas base?", Pokemon::baseStatTotal,
              value -> "BST " + value)),
      Map.entry(PokemonTriviaQuestionType.SPEED,
          new NumericQuestion("¿Cuál tiene mayor Velocidad base?", Pokemon::speed, value -> "Velocidad base " + value)),
      Map.entry(PokemonTriviaQuestionType.HEIGHT,
          new NumericQuestion("¿Cuál es el Pokémon más alto?", Pokemon::heightDecimeters,
              value -> PokemonTriviaRules.formatEs(value / 10.0) + " m")),
      Map.entry(PokemonTriviaQuestionType.WEIGHT,
          new NumericQuestion("¿Cuál es el Pokémon más pesado?", Pokemon::weightHectograms,
              value -> PokemonTriviaRules.formatEs(value / 10.0) + " kg")),
      Map.entry(PokemonTriviaQuestionType.DEX_NUMBER,
          new NumericQuestion("¿Cuál aparece más tarde en la Pokédex Nacional?", Pokemon::nationalDexNumber,
              value -> "N.º " + value + " de la Pokédex Nacional")));

  private record Built(List<PokemonTriviaOption> options, PokemonTriviaOptionId correctOptionId) {}

  /** {@code makeOptions}: baraja las opciones y les asigna A, B, C, D por posición. */
  private static Built makeOptions(List<Pokemon> pokemon, String correctId, DoubleSupplier random) {
    var shuffled = Randoms.takeRandom(pokemon, pokemon.size(), random);
    var ids = PokemonTriviaOptionId.values();
    var options = new ArrayList<PokemonTriviaOption>();
    for (int index = 0; index < shuffled.size(); index++) {
      var entry = shuffled.get(index);
      options.add(new PokemonTriviaOption(ids[index],
          new PokemonTriviaOptionPokemon(entry.id(), entry.name(), entry.sprite())));
    }
    var correct = options.stream().filter(option -> option.pokemon().id().equals(correctId)).findFirst().orElseThrow();
    return new Built(options, correct.id());
  }

  private static List<Pokemon> withTarget(Pokemon target, List<Pokemon> selected) {
    var all = new ArrayList<Pokemon>();
    all.add(target);
    all.addAll(selected);
    return all;
  }

  /** {@code categoricalQuestion}: tipo o generación del objetivo que ningún distractor comparte. */
  private static @Nullable PokemonTriviaQuestion categoricalQuestion(PokemonTriviaQuestionType type, List<Pokemon> pool,
      int count, Set<String> used, DoubleSupplier random) {
    boolean byType = type == PokemonTriviaQuestionType.TYPE;
    for (var target : Randoms.takeRandom(pool, pool.size(), random)) {
      String discriminator;
      if (byType) {
        var picked = Randoms.takeRandom(target.types(), 1, random);
        if (picked.isEmpty()) continue;
        discriminator = picked.getFirst();
      } else {
        discriminator = String.valueOf(target.generation());
      }
      var key = type.name() + ":" + discriminator;
      if (used.contains(key)) continue;
      var distractors = pool.stream()
          .filter(candidate -> !candidate.id().equals(target.id()) && (byType
              ? !candidate.types().contains(discriminator)
              : candidate.generation() != target.generation()))
          .toList();
      var selected = Randoms.takeRandom(distractors, count - 1, random);
      if (selected.size() != count - 1) continue;
      var built = makeOptions(withTarget(target, selected), target.id(), random);
      var label = byType ? TYPE_LABELS.get(discriminator) : "la generación " + discriminator;
      var prompt = byType ? "¿Cuál de estos Pokémon es de tipo " + label + "?"
          : "¿Cuál de estos Pokémon pertenece a " + label + "?";
      return new PokemonTriviaQuestion(key, type, prompt, built.options(), built.correctOptionId(),
          target.name() + " es la respuesta correcta: pertenece a " + label + ".");
    }
    return null;
  }

  /**
   * {@code numericQuestion}: el objetivo tiene el mayor valor; los distractores salen de los inferiores, ordenados de
   * mayor a menor (orden estable) y recortados según la dificultad. La clave ordena los ids con el orden por defecto
   * de {@code Array.prototype.sort} (unidades UTF-16), que es el de {@link String#compareTo}.
   */
  private static @Nullable PokemonTriviaQuestion numericQuestion(PokemonTriviaQuestionType type, List<Pokemon> pool,
      int count, PokemonTriviaDifficulty difficulty, Set<String> used, DoubleSupplier random) {
    var definition = NUMERIC_QUESTIONS.get(type);
    var valid = pool.stream().filter(pokemon -> definition.value().applyAsInt(pokemon) > 0).toList();
    for (var target : Randoms.takeRandom(valid, valid.size(), random)) {
      int targetValue = definition.value().applyAsInt(target);
      var ordered = new ArrayList<>(valid.stream()
          .filter(candidate -> !candidate.id().equals(target.id())
              && definition.value().applyAsInt(candidate) < targetValue)
          .toList());
      ordered.sort(Comparator.comparingInt(definition.value()).reversed());
      int easyStart = Math.min(ordered.size() / 2, Math.max(0, ordered.size() - (count - 1)));
      List<Pokemon> candidates = switch (difficulty) {
        case HARD -> ordered.subList(0, Math.min(ordered.size(), Math.max(count * 3, count - 1)));
        case EASY -> ordered.subList(easyStart, ordered.size());
        case NORMAL -> ordered;
      };
      var selected = Randoms.takeRandom(candidates, count - 1, random);
      if (selected.size() != count - 1) continue;
      var built = makeOptions(withTarget(target, selected), target.id(), random);
      var key = type.name() + ":" + String.join(",",
          built.options().stream().map(option -> option.pokemon().id()).sorted().toList());
      if (used.contains(key)) continue;
      return new PokemonTriviaQuestion(key, type, definition.prompt(), built.options(), built.correctOptionId(),
          target.name() + ": " + definition.fact().apply(targetValue) + ".");
    }
    return null;
  }

  /**
   * {@code createPokemonTriviaQuestion}: prueba primero los tipos no usados en las dos últimas rondas y, si ninguno
   * produce pregunta, reinicia las claves usadas y repite.
   */
  static PokemonTriviaQuestion create(PokemonTriviaState state, GameContext context) {
    var pool = new ArrayList<Pokemon>();
    for (var id : state.poolIds()) context.pokemon().byId(id).ifPresent(pool::add);
    var used = new HashSet<>(state.usedQuestionKeys());
    var recentTypes = state.recentQuestionTypes();
    var recent = new LinkedHashSet<>(recentTypes.subList(Math.max(0, recentTypes.size() - 2), recentTypes.size()));
    var questionTypes = state.config().questionTypes();
    var preferred = questionTypes.stream().filter(type -> !recent.contains(type)).toList();
    List<PokemonTriviaQuestionType> typeOrder;
    if (!preferred.isEmpty()) {
      typeOrder = new ArrayList<>(Randoms.takeRandom(preferred, preferred.size(), context.random()));
      typeOrder.addAll(Randoms.takeRandom(questionTypes.stream().filter(recent::contains).toList(), recent.size(),
          context.random()));
    } else {
      typeOrder = Randoms.takeRandom(questionTypes, questionTypes.size(), context.random());
    }
    var config = state.config();
    for (var type : typeOrder) {
      var question = type == PokemonTriviaQuestionType.TYPE || type == PokemonTriviaQuestionType.GENERATION
          ? categoricalQuestion(type, pool, config.optionCount(), used, context.random())
          : numericQuestion(type, pool, config.optionCount(), config.difficulty(), used, context.random());
      if (question != null) return question;
    }
    if (!used.isEmpty()) return create(state.toBuilder().usedQuestionKeys(List.of()).build(), context);
    throw new EngineException("No hay suficientes datos distintos para crear preguntas con esta configuración.");
  }
}

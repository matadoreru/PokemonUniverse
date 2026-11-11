package es.pokemonuniverse.domain.game.engines.pokeddlerace;

import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.EvolutionValue;
import es.pokemonuniverse.domain.game.engines.pokeddlerace.PokeddleRaceTypes.PokeddleFeedbackEntry;
import es.pokemonuniverse.domain.json.JsNumbers;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Reglas de Pokédle Race (antes en {@code pokeddle-race/rules.ts}; la etapa evolutiva ya no es traducción literal). */
public final class PokeddleRaceRules {

  private PokeddleRaceRules() {}

  /** {@code secret > guess ? 'HIGHER' : secret < guess ? 'LOWER' : 'MATCH'}. */
  public static String comparePokeddleNumber(int guess, int secret) {
    return secret > guess ? "HIGHER" : secret < guess ? "LOWER" : "MATCH";
  }

  /**
   * Etapa evolutiva: verde ({@code MATCH}) solo si coinciden etapa y total; misma etapa con otro total es
   * {@code PARTIAL}; si la etapa difiere, {@code HIGHER}/{@code LOWER} por la etapa.
   */
  public static String comparePokeddleEvolution(EvolutionValue guess, EvolutionValue secret) {
    if (guess.stage() != secret.stage()) return comparePokeddleNumber(guess.stage(), secret.stage());
    return guess.stages() == secret.stages() ? "MATCH" : "PARTIAL";
  }

  /** Comparación de conjuntos de tipos: igual → {@code EXACT}, alguno en común → {@code PARTIAL}. */
  public static String comparePokeddleTypes(List<String> guess, List<String> secret) {
    var guessed = new LinkedHashSet<>(guess);
    var target = new HashSet<>(secret);
    if (guessed.size() == target.size() && target.containsAll(guessed)) return "EXACT";
    return guessed.stream().anyMatch(target::contains) ? "PARTIAL" : "NONE";
  }

  private static PokeddleFeedbackEntry.Numeric numeric(int value, int secret) {
    return new PokeddleFeedbackEntry.Numeric(value, comparePokeddleNumber(value, secret));
  }

  private static List<String> abilities(Pokemon pokemon) {
    return pokemon.abilities() == null ? List.of() : pokemon.abilities();
  }

  /**
   * Las pistas se añaden en el orden de {@code POKEDDLE_CLUE_KEYS}, igual que la cadena de {@code if} de TS. La etapa
   * evolutiva sale de {@code evolutions}, la de la partida (solo con las generaciones elegidas).
   */
  public static Map<String, PokeddleFeedbackEntry> buildPokeddleFeedback(Pokemon guess, Pokemon secret,
      PokeddleRaceConfig config, Map<String, EvolutionValue> evolutions) {
    var enabled = new HashSet<>(config.activeClues());
    var feedback = new LinkedHashMap<String, PokeddleFeedbackEntry>();
    if (enabled.contains("generation")) feedback.put("generation", numeric(guess.generation(), secret.generation()));
    if (enabled.contains("dexNumber")) {
      feedback.put("dexNumber", numeric(guess.nationalDexNumber(), secret.nationalDexNumber()));
    }
    if (enabled.contains("types")) {
      feedback.put("types", new PokeddleFeedbackEntry.Types(guess.types(),
          comparePokeddleTypes(guess.types(), secret.types())));
    }
    if (enabled.contains("typeCount")) feedback.put("typeCount", numeric(guess.types().size(), secret.types().size()));
    if (enabled.contains("hp")) feedback.put("hp", numeric(guess.hp(), secret.hp()));
    if (enabled.contains("attack")) feedback.put("attack", numeric(guess.attack(), secret.attack()));
    if (enabled.contains("defense")) feedback.put("defense", numeric(guess.defense(), secret.defense()));
    if (enabled.contains("specialAttack")) {
      feedback.put("specialAttack", numeric(guess.specialAttack(), secret.specialAttack()));
    }
    if (enabled.contains("specialDefense")) {
      feedback.put("specialDefense", numeric(guess.specialDefense(), secret.specialDefense()));
    }
    if (enabled.contains("speed")) feedback.put("speed", numeric(guess.speed(), secret.speed()));
    if (enabled.contains("baseStatTotal")) {
      feedback.put("baseStatTotal", numeric(guess.baseStatTotal(), secret.baseStatTotal()));
    }
    if (enabled.contains("height")) feedback.put("height", numeric(guess.heightDecimeters(), secret.heightDecimeters()));
    if (enabled.contains("weight")) feedback.put("weight", numeric(guess.weightHectograms(), secret.weightHectograms()));
    if (enabled.contains("evolutionStage")) {
      var guessed = evolution(evolutions, guess);
      feedback.put("evolutionStage", new PokeddleFeedbackEntry.Evolution(guessed,
          comparePokeddleEvolution(guessed, evolution(evolutions, secret))));
    }
    if (enabled.contains("legendaryStatus")) {
      var guessed = Objects.requireNonNullElse(guess.legendaryStatus(), "NORMAL");
      var target = Objects.requireNonNullElse(secret.legendaryStatus(), "NORMAL");
      feedback.put("legendaryStatus",
          new PokeddleFeedbackEntry.Category(guessed, guessed.equals(target) ? "MATCH" : "NONE"));
    }
    if (enabled.contains("color")) {
      feedback.put("color", new PokeddleFeedbackEntry.Category(Objects.requireNonNullElse(guess.color(), "unknown"),
          Objects.equals(guess.color(), secret.color()) ? "MATCH" : "NONE"));
    }
    if (enabled.contains("abilities")) {
      var target = new HashSet<>(abilities(secret));
      int matches = (int) abilities(guess).stream().filter(target::contains).count();
      feedback.put("abilities", new PokeddleFeedbackEntry.Abilities(abilities(guess),
          matches != 0 ? "PARTIAL" : "NONE", matches));
    }
    return feedback;
  }

  /** Intento y secreto están siempre en el pool; fuera de él (no debería pasar) cuenta como 1/1. */
  private static EvolutionValue evolution(Map<String, EvolutionValue> evolutions, Pokemon pokemon) {
    return evolutions.getOrDefault(pokemon.id(), new EvolutionValue(1, 1));
  }

  /** Veracidad de JS: {@code 0}, {@code ''} y {@code null} cuentan como ausentes. */
  public static boolean hasCompletePokeddleMetadata(Pokemon pokemon, PokeddleRaceConfig config) {
    return (!config.clue("height") || pokemon.heightDecimeters() > 0)
        && (!config.clue("weight") || pokemon.weightHectograms() > 0)
        && (!config.clue("evolutionStage") || (JsNumbers.truthy(pokemon.evolutionStage())
            && JsNumbers.truthy(pokemon.evolutionStageCount())))
        && (!config.clue("legendaryStatus") || JsStrings.truthy(pokemon.legendaryStatus()))
        && (!config.clue("color") || (JsStrings.truthy(pokemon.color()) && !"unknown".equals(pokemon.color())))
        && (!config.clue("abilities") || !abilities(pokemon).isEmpty());
  }
}

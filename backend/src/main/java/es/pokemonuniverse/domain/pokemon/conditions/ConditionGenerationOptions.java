package es.pokemonuniverse.domain.pokemon.conditions;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenMap;

import java.util.List;
import java.util.Map;

/**
 * {@code ConditionGenerationOptions} de {@code pokemon/conditions/types.ts}: {@code families} va indexado por las
 * claves de {@link #BINGO_FAMILY_KEYS} y {@code maxConditions} es {@code 1} o {@code 2}.
 */
public record ConditionGenerationOptions(List<Integer> generations, Map<String, Boolean> families, int maxConditions,
    int combinationLimit) {

  /** {@code BINGO_FAMILY_KEYS} de {@code pokemon/conditions/types.ts}. */
  public static final List<String> BINGO_FAMILY_KEYS = List.of(
      "generation", "dexNumber", "type", "typeCombination", "typeCount",
      "hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal",
      "height", "weight", "evolutionStage", "legendaryStatus", "color", "abilities");

  public ConditionGenerationOptions {
    generations = List.copyOf(generations);
    families = frozenMap(families);
  }

  /** {@code config.families[key]}; una clave ausente es {@code undefined} (falso). */
  public boolean family(String key) {
    return Boolean.TRUE.equals(families.get(key));
  }
}

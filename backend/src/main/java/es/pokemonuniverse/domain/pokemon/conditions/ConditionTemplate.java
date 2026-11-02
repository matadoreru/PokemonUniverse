package es.pokemonuniverse.domain.pokemon.conditions;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;

import java.util.List;

/** {@code BingoConditionTemplate} de {@code pokemon/conditions/generator.ts}. */
public record ConditionTemplate(List<Condition> conditions, String key, List<String> candidatePokemonIds,
    ConditionDifficulty difficulty) {

  public ConditionTemplate {
    conditions = frozenList(conditions);
    candidatePokemonIds = frozenList(candidatePokemonIds);
  }
}

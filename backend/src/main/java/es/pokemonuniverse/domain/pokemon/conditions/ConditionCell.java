package es.pokemonuniverse.domain.pokemon.conditions;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** {@code BingoCell} de {@code pokemon/conditions/types.ts}. */
@Serdeable
@JsonInclude(JsonInclude.Include.ALWAYS)
public record ConditionCell(String id, List<Condition> conditions) {

  public ConditionCell {
    conditions = frozenList(conditions);
  }
}

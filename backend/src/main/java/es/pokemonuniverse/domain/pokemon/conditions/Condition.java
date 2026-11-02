package es.pokemonuniverse.domain.pokemon.conditions;

import static es.pokemonuniverse.domain.game.engine.infra.Immutables.frozenList;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/**
 * {@code BingoCondition} de {@code pokemon/conditions/types.ts}: unión discriminada por {@code kind}. Cada variante
 * es un record con {@code kind} primero y sus campos en el orden del literal TS; Serde serializa el tipo concreto, sin
 * propiedad de tipo añadida. La comparten Pokémon Bingo y Pokémon Bluff Auction.
 */
public sealed interface Condition {

  String kind();

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record Generation(String kind, int generation) implements Condition {
    public Generation(int generation) { this("GENERATION", generation); }
  }

  /** {@code max} es el {@code max?:} de TS: solo existe en {@code RANGE}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record Dex(String kind, ConditionOperator operator, int value,
      @Nullable @JsonInclude(JsonInclude.Include.NON_NULL) Integer max) implements Condition {
    public Dex(ConditionOperator operator, int value) { this("DEX", operator, value, null); }

    public static Dex range(int value, int max) { return new Dex("DEX", ConditionOperator.RANGE, value, max); }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record Type(String kind, String pokemonType) implements Condition {
    public Type(String pokemonType) { this("TYPE", pokemonType); }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record TypeCombination(String kind, List<String> pokemonTypes) implements Condition {
    public TypeCombination {
      pokemonTypes = frozenList(pokemonTypes);
    }

    public TypeCombination(List<String> pokemonTypes) { this("TYPE_COMBINATION", pokemonTypes); }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record TypeCount(String kind, int count) implements Condition {
    public TypeCount(int count) { this("TYPE_COUNT", count); }
  }

  /** {@code stat} es la clave de TS ({@code hp}, {@code specialAttack}, {@code baseStatTotal}…). */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record Stat(String kind, String stat, ConditionOperator operator, int value) implements Condition {
    public Stat(String stat, ConditionOperator operator, int value) { this("STAT", stat, operator, value); }
  }

  /** {@code metric} es {@code heightDecimeters} o {@code weightHectograms}. */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record Physical(String kind, String metric, ConditionOperator operator, int value) implements Condition {
    public Physical(String metric, ConditionOperator operator, int value) { this("PHYSICAL", metric, operator, value); }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record Evolution(String kind, ConditionEvolutionStatus status) implements Condition {
    public Evolution(ConditionEvolutionStatus status) { this("EVOLUTION", status); }
  }

  /** {@code status} es un {@code PokemonLegendaryStatus} ({@code NORMAL}, {@code LEGENDARY}, {@code MYTHICAL}). */
  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record Legendary(String kind, String status) implements Condition {
    public Legendary(String status) { this("LEGENDARY", status); }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record Color(String kind, String color) implements Condition {
    public Color(String color) { this("COLOR", color); }
  }

  @Serdeable
  @JsonInclude(JsonInclude.Include.ALWAYS)
  record Ability(String kind, String ability) implements Condition {
    public Ability(String ability) { this("ABILITY", ability); }
  }
}

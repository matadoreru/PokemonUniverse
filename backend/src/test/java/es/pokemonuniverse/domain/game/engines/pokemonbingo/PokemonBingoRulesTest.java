package es.pokemonuniverse.domain.game.engines.pokemonbingo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoCondition;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoEvolutionStatus;
import es.pokemonuniverse.domain.game.engines.pokemonbingo.PokemonBingoTypes.BingoOperator;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Textos y claves de condición; los valores esperados salen de ejecutar {@code describeBingoCondition} y
 * {@code bingoConditionKey} TS.
 */
class PokemonBingoRulesTest {

  private static void check(BingoCondition condition, String description, String key) {
    assertEquals(description, PokemonBingoRules.describeBingoCondition(condition));
    assertEquals(key, PokemonBingoRules.bingoConditionKey(condition));
  }

  @Test
  void describesEveryConditionKind() {
    check(new BingoCondition.Generation(2), "Generación 2", "GEN:2");
    check(new BingoCondition.Dex(BingoOperator.GT, 53), "Pokédex > 53", "DEX:GT:53:");
    check(new BingoCondition.Dex(BingoOperator.LT, 7), "Pokédex < 7", "DEX:LT:7:");
    check(BingoCondition.Dex.range(51, 126), "Pokédex 51–126", "DEX:RANGE:51:126");
    check(new BingoCondition.Type("psychic"), "Tipo Psíquico", "TYPE:psychic");
    check(new BingoCondition.TypeCombination(List.of("poison", "flying")), "Veneno + Volador", "TYPES:flying+poison");
    check(new BingoCondition.TypeCount(1), "Monotipo", "TYPE_COUNT:1");
    check(new BingoCondition.TypeCount(2), "Doble tipo", "TYPE_COUNT:2");
    check(new BingoCondition.Stat("specialDefense", BingoOperator.GT, 80), "Def. Especial > 80",
        "STAT:specialDefense:GT:80");
    check(new BingoCondition.Physical("heightDecimeters", BingoOperator.LT, 17), "Altura < 1,7 m",
        "PHYSICAL:heightDecimeters:LT:17");
    check(new BingoCondition.Physical("weightHectograms", BingoOperator.GT, 4600), "Peso > 460 kg",
        "PHYSICAL:weightHectograms:GT:4600");
    check(new BingoCondition.Physical("weightHectograms", BingoOperator.GT, 123456), "Peso > 12.345,6 kg",
        "PHYSICAL:weightHectograms:GT:123456");
    check(new BingoCondition.Physical("heightDecimeters", BingoOperator.GT, 20), "Altura > 2 m",
        "PHYSICAL:heightDecimeters:GT:20");
    check(new BingoCondition.Evolution(BingoEvolutionStatus.MIDDLE), "Evolución intermedia", "EVOLUTION:MIDDLE");
    check(new BingoCondition.Evolution(BingoEvolutionStatus.NONE), "No evoluciona", "EVOLUTION:NONE");
    check(new BingoCondition.Legendary("MYTHICAL"), "Mítico", "LEGENDARY:MYTHICAL");
    check(new BingoCondition.Legendary("NORMAL"), "No legendario", "LEGENDARY:NORMAL");
    check(new BingoCondition.Color("light-blue"), "Color principal: Light Blue", "COLOR:light-blue");
    check(new BingoCondition.Ability("cuerpo-puro"), "Puede tener Cuerpo Puro", "ABILITY:cuerpo-puro");
    check(new BingoCondition.Ability("Vista Lince"), "Puede tener Vista Lince", "ABILITY:Vista Lince");
  }
}

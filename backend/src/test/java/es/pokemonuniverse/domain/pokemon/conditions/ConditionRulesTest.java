package es.pokemonuniverse.domain.pokemon.conditions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.golden.GoldenCatalogs;
import es.pokemonuniverse.golden.WebContracts;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Reglas de condición compartidas. Los textos y claves esperados salen de ejecutar {@code describeBingoCondition} y
 * {@code bingoConditionKey} TS; las coincidencias usan Pokémon de la fixture {@code gen1-2}, uno por operador.
 */
class ConditionRulesTest {

  private static final PokemonCatalog CATALOG = GoldenCatalogs.load("gen1-2");

  private static Pokemon pokemon(String id) {
    return CATALOG.byId(id).orElseThrow();
  }

  private static boolean matches(String id, Condition condition) {
    return ConditionRules.pokemonMatchesBingoCondition(pokemon(id), condition);
  }

  private static void check(Condition condition, String description, String key) {
    assertEquals(description, ConditionRules.describeBingoCondition(condition));
    assertEquals(key, ConditionRules.bingoConditionKey(condition));
  }

  @Test
  void describesEveryConditionKind() {
    check(new Condition.Generation(2), "Generación 2", "GEN:2");
    check(new Condition.Dex(ConditionOperator.GT, 53), "Pokédex > 53", "DEX:GT:53:");
    check(new Condition.Dex(ConditionOperator.LT, 7), "Pokédex < 7", "DEX:LT:7:");
    check(Condition.Dex.range(51, 126), "Pokédex 51–126", "DEX:RANGE:51:126");
    check(new Condition.Type("psychic"), "Tipo Psíquico", "TYPE:psychic");
    check(new Condition.TypeCombination(List.of("poison", "flying")), "Veneno + Volador",
        "TYPES:flying+poison");
    check(new Condition.TypeCount(1), "Monotipo", "TYPE_COUNT:1");
    check(new Condition.TypeCount(2), "Doble tipo", "TYPE_COUNT:2");
    check(new Condition.Stat("specialDefense", ConditionOperator.GT, 80), "Def. Especial > 80",
        "STAT:specialDefense:GT:80");
    check(new Condition.Physical("heightDecimeters", ConditionOperator.LT, 17), "Altura < 1,7 m",
        "PHYSICAL:heightDecimeters:LT:17");
    check(new Condition.Physical("weightHectograms", ConditionOperator.GT, 4600), "Peso > 460 kg",
        "PHYSICAL:weightHectograms:GT:4600");
    check(new Condition.Physical("weightHectograms", ConditionOperator.GT, 123456), "Peso > 12.345,6 kg",
        "PHYSICAL:weightHectograms:GT:123456");
    check(new Condition.Physical("heightDecimeters", ConditionOperator.GT, 20), "Altura > 2 m",
        "PHYSICAL:heightDecimeters:GT:20");
    check(new Condition.Evolution(ConditionEvolutionStatus.MIDDLE), "Evolución intermedia", "EVOLUTION:MIDDLE");
    check(new Condition.Evolution(ConditionEvolutionStatus.NONE), "No evoluciona", "EVOLUTION:NONE");
    check(new Condition.Legendary("MYTHICAL"), "Mítico", "LEGENDARY:MYTHICAL");
    check(new Condition.Legendary("NORMAL"), "No legendario", "LEGENDARY:NORMAL");
    check(new Condition.Color("light-blue"), "Color principal: Light Blue", "COLOR:light-blue");
    check(new Condition.Ability("cuerpo-puro"), "Puede tener Cuerpo Puro", "ABILITY:cuerpo-puro");
    check(new Condition.Ability("Vista Lince"), "Puede tener Vista Lince", "ABILITY:Vista Lince");
  }

  @Test
  void comparesDexNumbersWithEachOperator() {
    // Pikachu es el 25 de la Pokédex.
    assertTrue(matches("pikachu", new Condition.Dex(ConditionOperator.GT, 24)));
    assertFalse(matches("pikachu", new Condition.Dex(ConditionOperator.GT, 25)));
    assertTrue(matches("pikachu", new Condition.Dex(ConditionOperator.LT, 26)));
    assertFalse(matches("pikachu", new Condition.Dex(ConditionOperator.LT, 25)));
    // RANGE incluye los dos extremos.
    assertTrue(matches("pikachu", Condition.Dex.range(25, 25)));
    assertTrue(matches("pikachu", Condition.Dex.range(1, 25)));
    assertFalse(matches("pikachu", Condition.Dex.range(26, 151)));
    // Sin max, el rango es solo value ({@code condition.max ?? condition.value}).
    assertTrue(matches("pikachu", new Condition.Dex("DEX", ConditionOperator.RANGE, 25, null)));
    assertFalse(matches("pikachu", new Condition.Dex("DEX", ConditionOperator.RANGE, 24, null)));
  }

  @Test
  void comparesStatsAndPhysicalMetricsStrictly() {
    // Snorlax: 160 PS, 30 de velocidad, 2,1 m y 460 kg.
    assertTrue(matches("snorlax", new Condition.Stat("hp", ConditionOperator.GT, 159)));
    assertFalse(matches("snorlax", new Condition.Stat("hp", ConditionOperator.GT, 160)));
    assertTrue(matches("snorlax", new Condition.Stat("speed", ConditionOperator.LT, 31)));
    assertFalse(matches("snorlax", new Condition.Stat("speed", ConditionOperator.LT, 30)));
    assertTrue(matches("snorlax", new Condition.Physical("heightDecimeters", ConditionOperator.GT, 20)));
    assertFalse(matches("snorlax", new Condition.Physical("heightDecimeters", ConditionOperator.GT, 21)));
    assertTrue(matches("snorlax", new Condition.Physical("weightHectograms", ConditionOperator.LT, 4601)));
    assertFalse(matches("snorlax", new Condition.Physical("weightHectograms", ConditionOperator.LT, 4600)));
  }

  @Test
  void matchesTypesGenerationsAndCategories() {
    assertTrue(matches("bulbasaur", new Condition.Generation(1)));
    assertFalse(matches("bulbasaur", new Condition.Generation(2)));
    assertTrue(matches("bulbasaur", new Condition.Type("poison")));
    assertFalse(matches("charmander", new Condition.Type("poison")));
    // La combinación no depende del orden y exige exactamente dos tipos.
    assertTrue(matches("bulbasaur", new Condition.TypeCombination(List.of("poison", "grass"))));
    assertFalse(matches("onix", new Condition.TypeCombination(List.of("rock", "water"))));
    assertFalse(matches("charmander", new Condition.TypeCombination(List.of("fire", "fire"))));
    assertTrue(matches("charmander", new Condition.TypeCount(1)));
    assertTrue(matches("bulbasaur", new Condition.TypeCount(2)));
    assertTrue(matches("mewtwo", new Condition.Legendary("LEGENDARY")));
    assertTrue(matches("mew", new Condition.Legendary("MYTHICAL")));
    assertTrue(matches("tauros", new Condition.Legendary("NORMAL")));
    assertTrue(matches("pikachu", new Condition.Color("yellow")));
    assertFalse(matches("pikachu", new Condition.Color("green")));
    assertTrue(matches("onix", new Condition.Ability("Robustez")));
    assertFalse(matches("onix", new Condition.Ability("Sebo")));
  }

  @Test
  void matchesEvolutionStatusFromStageAndStageCount() {
    var base = new Condition.Evolution(ConditionEvolutionStatus.BASE);
    var middle = new Condition.Evolution(ConditionEvolutionStatus.MIDDLE);
    var finalStage = new Condition.Evolution(ConditionEvolutionStatus.FINAL);
    var none = new Condition.Evolution(ConditionEvolutionStatus.NONE);
    assertTrue(matches("bulbasaur", base));
    assertTrue(matches("ivysaur", middle));
    assertTrue(matches("venusaur", finalStage));
    assertTrue(matches("tauros", none));
    assertFalse(matches("tauros", base));
    assertFalse(matches("tauros", finalStage));
    assertFalse(matches("venusaur", middle));
    // Una línea de dos etapas no tiene intermedia: Snorlax es la final.
    assertTrue(matches("snorlax", finalStage));
    assertFalse(matches("snorlax", middle));
  }

  @Test
  void matchesACellOnlyWhenEveryConditionHolds() {
    var cell = new ConditionCell("cell-1",
        List.of(new Condition.Type("grass"), new Condition.Stat("baseStatTotal", ConditionOperator.GT, 500)));
    assertTrue(ConditionRules.pokemonMatchesBingoCell(pokemon("venusaur"), cell));
    assertFalse(ConditionRules.pokemonMatchesBingoCell(pokemon("ivysaur"), cell));
    assertEquals("STAT:baseStatTotal:GT:500&TYPE:grass", ConditionRules.bingoCellKey(cell.conditions()));
  }

  /**
   * La web describe las casillas con su propio {@code describeBingoCondition}: graba
   * {@code web-contracts/conditions-cases.json} (cada condición como la manda el cable y su texto), que lee
   * {@code packages/shared/src/pokemon/conditions/rules.test.ts}.
   */
  @Test
  void describesConditionsLikeTheWeb() throws IOException {
    var conditions = new ArrayList<Condition>();
    conditions.add(new Condition.Generation(2));
    conditions.add(new Condition.Dex(ConditionOperator.GT, 53));
    conditions.add(new Condition.Dex(ConditionOperator.LT, 7));
    conditions.add(Condition.Dex.range(51, 126));
    for (var type : List.of("normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
        "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy")) {
      conditions.add(new Condition.Type(type));
    }
    conditions.add(new Condition.TypeCombination(List.of("poison", "flying")));
    conditions.add(new Condition.TypeCount(1));
    conditions.add(new Condition.TypeCount(2));
    for (var stat : List.of("hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal")) {
      conditions.add(new Condition.Stat(stat, ConditionOperator.GT, 80));
    }
    conditions.add(new Condition.Stat("speed", ConditionOperator.LT, 45));
    for (int value : List.of(17, 20, 5, 4600, 12345, 123456, 9999)) {
      conditions.add(new Condition.Physical("heightDecimeters", ConditionOperator.LT, value));
      conditions.add(new Condition.Physical("weightHectograms", ConditionOperator.GT, value));
    }
    for (var status : ConditionEvolutionStatus.values()) conditions.add(new Condition.Evolution(status));
    for (var status : List.of("NORMAL", "LEGENDARY", "MYTHICAL")) conditions.add(new Condition.Legendary(status));
    conditions.add(new Condition.Color("light-blue"));
    conditions.add(new Condition.Color("red"));
    conditions.add(new Condition.Ability("cuerpo-puro"));
    conditions.add(new Condition.Ability("Vista Lince"));
    var cases = new ArrayList<LinkedHashMap<String, Object>>();
    for (var condition : conditions) {
      var entry = new LinkedHashMap<String, Object>();
      entry.put("condition", condition);
      entry.put("description", ConditionRules.describeBingoCondition(condition));
      cases.add(entry);
    }
    WebContracts.check("conditions-cases.json", cases);
  }
}

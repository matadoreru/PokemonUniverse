package es.pokemonuniverse.domain.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.golden.GoldenCatalogs;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class InMemoryPokemonCatalogTest {

  private static final InMemoryPokemonCatalog CATALOG = GoldenCatalogs.load("gen1-2");

  private static Pokemon pokemon(String id, int dex, boolean isDefault) {
    return new Pokemon(id, dex, id, 1, isDefault, "s", null, 1, 1, 1, 1, 1, 1, 6, 1, 1, null, null, "NORMAL", "red",
        List.of(), Map.of(), List.of("normal"));
  }

  @Test
  void loadsTheFixtureRows() {
    assertEquals(293, CATALOG.all().size());
    var bulbasaur = CATALOG.byId("bulbasaur").orElseThrow();
    assertEquals("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/1.png", bulbasaur.shinySprite());
    assertEquals(List.of("grass", "poison"), bulbasaur.types());
    assertEquals(3, bulbasaur.evolutionStageCount());
  }

  @Test
  void defaultsOfOneGenerationAreOrderedByDexNumber() {
    var gen1 = CATALOG.forGenerations(List.of(1), false);
    assertEquals(151, gen1.size());
    assertEquals(IntStream.rangeClosed(1, 151).boxed().toList(), gen1.stream().map(Pokemon::nationalDexNumber).toList());
    assertTrue(gen1.stream().allMatch(Pokemon::isDefault));
    assertEquals(gen1, CATALOG.forGenerations(List.of(1)));
  }

  @Test
  void includeFormsAddsOnlySupportedRegionalForms() {
    var gen1 = CATALOG.forGenerations(List.of(1), true);
    assertTrue(gen1.stream().anyMatch(p -> p.id().equals("vulpix-alola")));
    assertTrue(gen1.stream().filter(p -> !p.isDefault()).allMatch(p -> RegionalForms.isSupported(p.id())));
    assertTrue(gen1.size() > 151);
    assertEquals(CATALOG.all().size(), CATALOG.forGenerations(List.of(1, 2), true).size());
    assertEquals(100, CATALOG.forGenerations(List.of(2), false).size());
    assertEquals(List.of(), CATALOG.forGenerations(List.of(3), true));
  }

  @Test
  void looksUpByIdAndDexNumber() {
    assertEquals("pikachu", CATALOG.byDexNumber(25).orElseThrow().id());
    assertTrue(CATALOG.byId("raichu-alola").isPresent());
    assertEquals("raichu", CATALOG.byDexNumber(26).orElseThrow().id());
    assertFalse(CATALOG.byDexNumber(252).isPresent());
    assertFalse(CATALOG.byId("missingno").isPresent());
  }

  @Test
  void keepsTheFirstDefaultPerDexNumberAndOnlySupportedForms() {
    var catalog = new InMemoryPokemonCatalog(List.of(pokemon("a", 1, true), pokemon("a-dup", 1, true),
        pokemon("a-alola", 1, false), pokemon("a-totem-alola", 1, false), pokemon("a-cosplay", 1, false)));
    assertEquals(List.of("a", "a-alola"), catalog.all().stream().map(Pokemon::id).toList());
    assertEquals("a", catalog.byDexNumber(1).orElseThrow().id());
    assertFalse(catalog.byId("a-dup").isPresent());
    assertNull(catalog.byId("a").orElseThrow().shinySprite());
  }
}

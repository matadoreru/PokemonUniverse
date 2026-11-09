package es.pokemonuniverse.domain.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.golden.GoldenCatalogs;
import org.junit.jupiter.api.Test;

class PokedexEntryTextTest {

  private static final InMemoryPokemonCatalog CATALOG = GoldenCatalogs.load("gen1-2");

  private static Pokemon golden(String id) {
    return CATALOG.byId(id).orElseThrow();
  }

  @Test
  void masksNameCollapsingWhitespaceAndIgnoringCase() {
    assertEquals("??? guarda electricidad. ???.",
        PokedexEntryText.sanitize("Pikachu  guarda\nelectricidad. PIKACHU.", golden("pikachu")));
  }

  @Test
  void doesNotMaskNameGluedToAnotherLetter() {
    assertEquals("Pikachuelo", PokedexEntryText.sanitize("Pikachuelo", golden("pikachu")));
  }

  @Test
  void masksLocalizedAliasesFromNames() {
    // El alias "Raichu" solo está en names (el nombre es "Raichu de Alola").
    assertEquals("??? y ???.", PokedexEntryText.sanitize("Raichu de Alola y Raichu.", golden("raichu-alola")));
  }
}

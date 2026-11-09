package es.pokemonuniverse.domain.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class RegionalFormsTest {

  @Test
  void acceptsRegionalSuffix() {
    assertTrue(RegionalForms.isSupported("raichu-alola"));
  }

  @Test
  void acceptsTaurosPaldeaBreeds() {
    assertTrue(RegionalForms.isSupported("tauros-paldea-blaze-breed"));
  }

  @Test
  void acceptsDarmanitanGalarStandard() {
    assertTrue(RegionalForms.isSupported("darmanitan-galar-standard"));
  }

  @Test
  void rejectsTotem() {
    assertFalse(RegionalForms.isSupported("pikachu-totem-x"));
  }

  @Test
  void rejectsMega() {
    assertFalse(RegionalForms.isSupported("charizard-mega-x"));
  }

  @Test
  void regionGenerationOfEachForm() {
    assertEquals(7, RegionalForms.regionGeneration("vulpix-alola"));
    assertEquals(8, RegionalForms.regionGeneration("meowth-galar"));
    assertEquals(8, RegionalForms.regionGeneration("darmanitan-galar-standard"));
    assertEquals(8, RegionalForms.regionGeneration("growlithe-hisui"));
    assertEquals(8, RegionalForms.regionGeneration("basculin-white-striped"));
    assertEquals(9, RegionalForms.regionGeneration("wooper-paldea"));
    assertEquals(9, RegionalForms.regionGeneration("tauros-paldea-aqua-breed"));
    assertEquals(0, RegionalForms.regionGeneration("pikachu"));
  }
}

package es.pokemonuniverse.domain.pokemon;

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
}

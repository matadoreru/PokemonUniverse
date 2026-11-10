package es.pokemonuniverse.domain.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class GameModesTest {

  /** Sin esta entrada el servidor rechaza «Modos que se juegan» con «Este minijuego no tiene modos». */
  @Test
  void absurdPokedexHasItsTwoModesInCatalogOrder() {
    assertTrue(GameModes.hasModes("absurd-pokedex"));
    assertEquals(List.of("CLASSIC", "REAL_ENTRY"), GameModes.of("absurd-pokedex"));
  }

  /** {@code CLASSIC} se muestra como «Pokémon» en la web; aquí solo cuentan los nombres. */
  @Test
  void unownTranslatorHasItsTwoModesInCatalogOrder() {
    assertTrue(GameModes.hasModes("unown-translator"));
    assertEquals(List.of("CLASSIC", "MOVES"), GameModes.of("unown-translator"));
  }
}

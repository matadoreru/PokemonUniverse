package es.pokemonuniverse.application.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Validación de {@code persistedPokemonPalette} ({@code data-sync/pokemon-palette-sync.ts}). */
class PersistedPaletteTest {

  private static final String SPRITE = "https://sprites/pikachu.png";

  private static Map<String, Object> metadata(Object palette, Object weights) {
    var metadata = new HashMap<String, Object>();
    metadata.put("paletteVersion", 3);
    metadata.put("paletteSpriteUrl", SPRITE);
    metadata.put("palette", palette);
    metadata.put("paletteWeights", weights);
    return metadata;
  }

  @Test
  void acceptsAValidPersistedPalette() {
    var palette = PersistedPalette.from(metadata(List.of("#F8D030", "#000000", "#e0e0e0"), List.of(0.5, 0.25, 0.25)),
        SPRITE);
    assertEquals(List.of("#F8D030", "#000000", "#e0e0e0"), palette.palette());
    assertEquals(List.of(0.5, 0.25, 0.25), palette.paletteWeights());
  }

  @Test
  void filtersInvalidEntriesBeforeCounting() {
    var palette = PersistedPalette.from(metadata(List.of("#111111", "red", "#222222", 7, "#333333"),
        List.of(1, 0, 2, true, -1, 3.5, Double.NaN)), SPRITE);
    assertEquals(List.of("#111111", "#222222", "#333333"), palette.palette());
    assertEquals(List.of(1.0, 2.0, 3.5), palette.paletteWeights());
    // Un decimal 3.0 es el mismo número que 3 en JS.
    var asDouble = metadata(List.of("#111111", "#222222", "#333333"), List.of(1, 1, 1));
    asDouble.put("paletteVersion", 3.0);
    assertEquals(3, PersistedPalette.from(asDouble, SPRITE).palette().size());
  }

  @Test
  void rejectsStaleShortOrUnweightedPalettes() {
    var colors = List.of("#111111", "#222222", "#333333");
    var weights = List.of(1, 1, 1);
    assertNull(PersistedPalette.from(null, SPRITE));
    assertNull(PersistedPalette.from(metadata(colors, weights), "https://sprites/otro.png"));
    var oldVersion = metadata(colors, weights);
    oldVersion.put("paletteVersion", 2);
    assertNull(PersistedPalette.from(oldVersion, SPRITE));
    var noVersion = metadata(colors, weights);
    noVersion.remove("paletteVersion");
    assertNull(PersistedPalette.from(noVersion, SPRITE));
    assertNull(PersistedPalette.from(metadata(List.of("#111111", "#222222"), List.of(1, 1)), SPRITE));
    assertNull(PersistedPalette.from(metadata(colors, List.of(1, 1)), SPRITE));
    assertNull(PersistedPalette.from(metadata(colors, null), SPRITE));
    assertNull(PersistedPalette.from(metadata("#111111", weights), SPRITE));
  }
}

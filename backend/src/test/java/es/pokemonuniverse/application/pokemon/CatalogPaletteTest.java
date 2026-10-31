package es.pokemonuniverse.application.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Mismo filtrado que {@code loadPokemonCatalog} ({@code pokemon/catalog.ts}). */
class CatalogPaletteTest {

  private static final List<String> EIGHT =
      List.of("#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888");

  private static Map<String, Object> metadata(Object palette, Object weights) {
    var metadata = new HashMap<String, Object>();
    metadata.put("palette", palette);
    metadata.put("paletteWeights", weights);
    return metadata;
  }

  @Test
  void keepsPaletteAndMatchingWeights() {
    var palette = CatalogPalette.from(metadata(List.of("#F8D030", "#000000", "#e0e0e0"), List.of(0.5, 0.25, 0.25)));
    assertEquals(List.of("#F8D030", "#000000", "#e0e0e0"), palette.palette());
    assertEquals(List.of(0.5, 0.25, 0.25), palette.paletteWeights());
  }

  @Test
  void filtersInvalidEntriesBeforeCounting() {
    var palette = CatalogPalette.from(metadata(List.of("#111111", "red", "#222222", 7, "#333333"),
        List.of(1, 0, 2, true, -1, 3.5, Double.NaN)));
    assertEquals(List.of("#111111", "#222222", "#333333"), palette.palette());
    assertEquals(List.of(1.0, 2.0, 3.5), palette.paletteWeights());
  }

  /** Ni la versión ni el sprite de la paleta cuentan: una paleta obsoleta sigue en el catálogo, como en Node. */
  @Test
  void ignoresPaletteVersionAndSprite() {
    var stale = metadata(List.of("#111111", "#222222", "#333333"), List.of(1, 1, 1));
    stale.put("paletteVersion", 2);
    stale.put("paletteSpriteUrl", "https://sprites/otro.png");
    assertEquals(3, CatalogPalette.from(stale).palette().size());
    assertEquals(List.of(1.0, 1.0, 1.0), CatalogPalette.from(stale).paletteWeights());
  }

  /** Con pesos de otra longitud (o sin pesos) se conserva la paleta y se descartan solo los pesos. */
  @Test
  void dropsOnlyTheWeightsWhenTheyDoNotMatch() {
    var mismatched = CatalogPalette.from(metadata(EIGHT, List.of(5, 4, 3, 2, 1, 1)));
    assertEquals(EIGHT, mismatched.palette());
    assertNull(mismatched.paletteWeights());
    assertNull(CatalogPalette.from(metadata(EIGHT, null)).paletteWeights());
  }

  @Test
  void needsThreeValidColors() {
    assertNull(CatalogPalette.from(null));
    assertNull(CatalogPalette.from(metadata(List.of("#111111", "#222222"), List.of(1, 1))));
    assertNull(CatalogPalette.from(metadata(List.of("#111111", "#222222", "blue"), List.of(1, 1, 1))));
    assertNull(CatalogPalette.from(metadata("#111111", List.of(1))));
  }
}

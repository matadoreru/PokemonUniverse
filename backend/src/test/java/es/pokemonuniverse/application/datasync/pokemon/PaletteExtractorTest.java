package es.pokemonuniverse.application.datasync.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * {@code extractPokemonPaletteData} de {@code pokemon-palette-sync.ts}: las salidas esperadas se obtuvieron una vez
 * ejecutando la función de Node sobre los mismos PNG ({@code scripts/export-pokeapi-parity.mts}).
 */
class PaletteExtractorTest {

  private static final String DIR = "/datasync/palette/";
  private static final ObjectMapper JSON = ObjectMapper.getDefault();

  private static byte[] png(String path) throws IOException {
    try (InputStream in = PaletteExtractorTest.class.getResourceAsStream(path)) {
      if (in == null) throw new IOException("missing " + path);
      return in.readAllBytes();
    }
  }

  private static JsonNode expected(String name) throws IOException {
    return JSON.readValue(png(DIR + "expected.json"), JsonNode.class).get(name);
  }

  private static void assertSameAsNode(String name, PaletteExtractor.Palette palette) throws IOException {
    var node = expected(name);
    var colors = new ArrayList<String>();
    node.get("colors").values().forEach(color -> colors.add(color.getStringValue()));
    var weights = new ArrayList<Double>();
    node.get("weights").values().forEach(weight -> weights.add(weight.getDoubleValue()));
    assertEquals(colors, palette.colors(), name);
    assertEquals(weights, palette.weights(), name);
  }

  /** Sin redimensionar (≤ 96 px) y redimensionando bloques uniformes de 2×2: paridad exacta con sharp. */
  @Test
  void matchesNodeOnSyntheticSprites() throws IOException {
    for (var name : List.of("three-blocks.png", "merge-close.png", "tie-break.png", "resize-blocks.png")) {
      assertSameAsNode(name, PaletteExtractor.extract(png(DIR + name)));
    }
  }

  @Test
  void threeBlocksGiveTheExactColoursOrderAndWeights() {
    // Mismo PNG que la prueba de Node: el bloque rojo (72 px) pesa el doble que los otros dos.
    assertEquals(List.of("#f04848", "#f0c030", "#3078d8"), extractQuietly("three-blocks.png").colors());
    assertEquals(List.of(0.5, 0.25, 0.25), extractQuietly("three-blocks.png").weights());
  }

  @Test
  void closeColoursMergeIntoTheFirstSelected() {
    // #e85050 y #d84848 (distancia < 42) suman su peso en uno solo.
    var palette = extractQuietly("merge-close.png");
    assertEquals(3, palette.colors().size());
    assertEquals(0.6, palette.weights().getFirst());
  }

  @Test
  void equalCountsAreOrderedWithLocaleCompare() {
    // "24:…" va antes que "240:…" en ICU; compareTo los ordenaría al revés.
    assertEquals(List.of("#001830", "#00f000", "#180000", "#f00000"), extractQuietly("tie-break.png").colors());
  }

  @Test
  void aSingleColourIsNotAPalette() throws IOException {
    var error = assertThrows(IllegalStateException.class, () -> PaletteExtractor.extract(png(DIR + "single-color.png")));
    assertEquals("El sprite no contiene una paleta suficientemente variada.", error.getMessage());
    assertEquals(expected("single-color.png").get("error").getStringValue(), error.getMessage());
  }

  /** Sprite real de PokéAPI (PNG indexado de 4 bits con transparencia tRNS, 96×96). */
  @Test
  void matchesNodeOnARecordedPokeApiSprite() throws IOException {
    assertSameAsNode("sprite-74.png",
        PaletteExtractor.extract(png("/datasync/pokeapi/raw/PokeAPI/sprites/master/sprites/pokemon/74.png")));
  }

  /**
   * Redimensión no entera (150×100 → 96×64) sobre ruido: depende del muestreo nearest de libvips; el centro de celda
   * reproduce exactamente los recuentos de sharp.
   */
  @Test
  void matchesNodeOnANonIntegerResizeOfNoise() throws IOException {
    assertSameAsNode("resize-noise.png", PaletteExtractor.extract(png(DIR + "resize-noise.png")));
  }

  @Test
  void anUnreadableImageFails() {
    assertThrows(IllegalArgumentException.class, () -> PaletteExtractor.extract(new byte[] {1, 2, 3}));
  }

  private static PaletteExtractor.Palette extractQuietly(String name) {
    try {
      return PaletteExtractor.extract(png(DIR + name));
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }
}

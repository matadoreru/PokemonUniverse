package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Los mismos casos que {@code applyCatalogPatch} en {@code catalog-patch.test.ts}. */
class GoldenCatalogsTest {

  private static final GoldenFixture.PalettePatch PATCH =
      new GoldenFixture.PalettePatch(List.of("#000000", "#111111", "#222222"), List.of(1.0, 2.0, 3.0));

  @Test
  void overlaysThePaletteOnlyOnPatchedRows() {
    var catalog = GoldenCatalogs.load("gen1-2", Map.of("pikachu", PATCH));
    var pikachu = catalog.byId("pikachu").orElseThrow();
    assertEquals(PATCH.palette(), pikachu.palette());
    assertEquals(PATCH.paletteWeights(), pikachu.paletteWeights());
    assertNull(catalog.byId("raichu").orElseThrow().palette());
    assertNull(GoldenCatalogs.load("gen1-2").byId("pikachu").orElseThrow().palette());
  }

  @Test
  void rejectsIdsOutsideTheCatalog() {
    var error = assertThrows(IllegalStateException.class, () -> GoldenCatalogs.load("gen1-2", Map.of("z", PATCH)));
    assertEquals("catalogPatch con Pokémon fuera del catálogo: z", error.getMessage());
  }

  @Test
  void theFixtureCarriesThePatch() throws IOException {
    var json = "{\"engineId\":\"fake\",\"scenario\":\"s\",\"seed\":1,\"catalog\":\"gen1-2\",\"catalogPatch\":"
        + "{\"pikachu\":{\"palette\":[\"#000000\",\"#111111\",\"#222222\"],\"paletteWeights\":[1,2,3]}},"
        + "\"players\":[],\"config\":{},\"steps\":[],\"expected\":{\"configNormalized\":{},"
        + "\"initial\":{\"finished\":false},\"afterStart\":{\"finished\":false},\"afterSteps\":[]}}";
    var fixture = ObjectMapper.getDefault().readValue(json, GoldenFixture.class);
    assertEquals(Map.of("pikachu", PATCH), fixture.catalogPatch());
  }
}

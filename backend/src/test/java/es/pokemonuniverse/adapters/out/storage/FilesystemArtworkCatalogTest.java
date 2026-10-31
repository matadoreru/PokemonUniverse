package es.pokemonuniverse.adapters.out.storage;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog.AlphaBounds;
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog.Asset;
import es.pokemonuniverse.domain.game.engine.PokemonVisualCatalog.Source;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FilesystemArtworkCatalogTest {

  @TempDir Path dir;

  private void png(String name, int width, int height, int x0, int y0, int w, int h) throws IOException {
    var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
    for (int y = y0; y < y0 + h; y++) for (int x = x0; x < x0 + w; x++) image.setRGB(x, y, 0xFF102030);
    ImageIO.write(image, "png", dir.resolve(name).toFile());
  }

  @Test
  void indexesValidArtworksWithNormalizedBounds() throws IOException {
    png("bulbasaur.png", 200, 100, 50, 25, 100, 50);
    png("vulpix-alola.png", 10, 10, 0, 0, 10, 10);
    png("mew.png", 10, 10, 0, 0, 10, 10); // fuera del catálogo
    png("Pikachu.png", 10, 10, 0, 0, 10, 10); // nombre no canónico
    png("ditto.png", 1000, 1000, 0, 0, 1, 1); // 1 píxel visible < 0,2 %
    Files.write(dir.resolve("eevee.png"), new byte[] {1, 2, 3}); // no es PNG
    var catalog = new FilesystemArtworkCatalog(dir, Set.of("bulbasaur", "vulpix-alola", "ditto", "eevee", "pikachu"));
    assertEquals(List.of("bulbasaur", "vulpix-alola"), catalog.artworkPokemonIds());
    assertEquals(new Asset("bulbasaur", Source.ARTWORK, "local-artwork:bulbasaur", 200, 100,
        new AlphaBounds(0.25, 0.25, 0.5, 0.5)), catalog.artworkFor("bulbasaur"));
    assertNull(catalog.artworkFor("ditto"));
  }

  @Test
  void missingDirectoryGivesEmptyCatalog() {
    var catalog = new FilesystemArtworkCatalog(dir.resolve("absent"), Set.of("bulbasaur"));
    assertEquals(List.of(), catalog.artworkPokemonIds());
  }
}

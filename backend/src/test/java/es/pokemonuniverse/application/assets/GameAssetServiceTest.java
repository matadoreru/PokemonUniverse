package es.pokemonuniverse.application.assets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.AssetResolution.Recolor;
import es.pokemonuniverse.domain.game.engine.AssetResolution.Transform;
import es.pokemonuniverse.domain.game.engine.EngineException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class GameAssetServiceTest {

  private static final String SOURCE = "https://raw.githubusercontent.com/a.png";

  private static byte[] sprite() throws IOException {
    var image = new BufferedImage(8, 8, BufferedImage.TYPE_INT_ARGB);
    for (int y = 1; y < 7; y++) for (int x = 1; x < 7; x++) image.setRGB(x, y, 0xFFFF0000);
    var out = new ByteArrayOutputStream();
    ImageIO.write(image, "png", out);
    return out.toByteArray();
  }

  private static int width(LoadedAsset asset) throws IOException {
    return ImageIO.read(new ByteArrayInputStream(asset.body())).getWidth();
  }

  @Test
  void dispatchesEachTransformToItsCanvas() throws IOException {
    var original = new LoadedAsset(sprite(), "image/webp");
    var service = new GameAssetService(source -> original, GameAssetService.defaultCache());
    assertSame(original, service.load(AssetResolution.original(SOURCE)));
    assertEquals(512, width(service.load(new AssetResolution(SOURCE, Transform.NORMALIZED, null, null, null))));
    assertEquals(512, width(service.load(new AssetResolution(SOURCE, Transform.FOCUSED_NORMALIZED, 3L, null, null))));
    assertEquals(512, width(service.load(new AssetResolution(SOURCE, Transform.ZOOM_CROP, 3L, 2.5, null))));
    assertEquals(320, width(service.load(new AssetResolution(SOURCE, Transform.SILHOUETTE, null, null, null))));
    assertEquals(192, width(service.load(new AssetResolution(SOURCE, Transform.PIXEL_ART, null, null, null))));
    var recolored = service.load(new AssetResolution(SOURCE, Transform.PALETTE_RECOLOR, null, null,
        new Recolor(120, 1, 1, 1)));
    assertEquals("image/png", recolored.contentType());
    assertEquals(192, width(recolored));
  }

  @Test
  void paletteRecolorRequiresParameters() {
    var service = new GameAssetService(source -> new LoadedAsset(new byte[0], "image/png"),
        GameAssetService.defaultCache());
    var error = assertThrows(EngineException.class,
        () -> service.load(new AssetResolution(SOURCE, Transform.PALETTE_RECOLOR, null, null, null)));
    assertEquals("Palette recolor transform requires recolor parameters", error.getMessage());
  }

  @Test
  void cacheKeyFollowsNodeFormat() {
    assertEquals("ORIGINAL::::" + SOURCE, GameAssetService.cacheKey(AssetResolution.original(SOURCE)));
    assertEquals("ZOOM_CROP:7:2.5::" + SOURCE,
        GameAssetService.cacheKey(new AssetResolution(SOURCE, Transform.ZOOM_CROP, 7L, 2.5, null)));
    assertEquals("PALETTE_RECOLOR:::-30:1.1:0.9:1:" + SOURCE, GameAssetService.cacheKey(
        new AssetResolution(SOURCE, Transform.PALETTE_RECOLOR, null, null, new Recolor(-30, 1.1, 0.9, 1))));
  }

  @Test
  void repeatedResolutionIsServedFromCache() throws IOException {
    var calls = new AtomicInteger();
    var bytes = sprite();
    var service = new GameAssetService(source -> {
      calls.incrementAndGet();
      return new LoadedAsset(bytes, "image/png");
    }, GameAssetService.defaultCache());
    var silhouette = new AssetResolution(SOURCE, Transform.SILHOUETTE, null, null, null);
    assertSame(service.load(silhouette), service.load(silhouette));
    service.load(AssetResolution.original(SOURCE));
    assertEquals(2, calls.get());
  }
}

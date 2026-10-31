package es.pokemonuniverse.domain.game.assets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.AssetResolution.Recolor;
import es.pokemonuniverse.domain.game.engine.EngineException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

/** Paridad por propiedades con {@code game-image-cache.ts} (constraint 18 de la 2B), no por bytes. */
class ImageTransformsTest {

  private static final int RED = 0xFFFF0000;

  /** Lienzo transparente {@code width×height} con un rectángulo opaco de {@code color}. */
  private static byte[] png(int width, int height, int x0, int y0, int w, int h, int color) {
    var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
    for (int y = y0; y < y0 + h; y++) for (int x = x0; x < x0 + w; x++) image.setRGB(x, y, color);
    return encode(image);
  }

  private static byte[] encode(BufferedImage image) {
    try {
      var out = new ByteArrayOutputStream();
      ImageIO.write(image, "png", out);
      return out.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static BufferedImage decode(byte[] png) {
    try {
      var image = ImageIO.read(new ByteArrayInputStream(png));
      assertTrue(png.length > 8 && png[1] == 'P' && png[2] == 'N' && png[3] == 'G', "salida PNG");
      return image;
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static int alpha(BufferedImage image, int x, int y) {
    return image.getRGB(x, y) >>> 24;
  }

  @Test
  void normalizedTrimsContainsAndPadsTo512() {
    // 100×50 con el contenido en una esquina: el recorte lo lleva a 10×10 y el contain a 472×472 + margen 20.
    var out = decode(ImageTransforms.normalized(png(100, 50, 0, 0, 10, 10, RED), null));
    assertEquals(512, out.getWidth());
    assertEquals(512, out.getHeight());
    assertEquals(0, alpha(out, 0, 0));
    assertEquals(0, alpha(out, 19, 256));
    assertEquals(255, alpha(out, 20, 20));
    assertEquals(255, alpha(out, 256, 256));
    assertEquals(255, alpha(out, 491, 491));
    assertEquals(0, alpha(out, 492, 256));
    assertEquals(0xFF0000, out.getRGB(256, 256) & 0xFFFFFF);
  }

  @Test
  void focusedNormalizedMovesFocusToCentreAndKeeps512() {
    // Contenido alargado: el foco (fuera del centro) se desplaza al centro del lienzo.
    var source = png(200, 20, 0, 0, 200, 20, RED);
    var plain = decode(ImageTransforms.normalized(source, null));
    var focused = decode(ImageTransforms.normalized(source, 3L));
    assertEquals(512, focused.getWidth());
    assertEquals(512, focused.getHeight());
    assertEquals(255, alpha(focused, 256, 256));
    int plainOpaque = 0;
    int focusedOpaque = 0;
    for (int x = 0; x < 512; x++) {
      if (alpha(plain, x, 256) > 0) plainOpaque++;
      if (alpha(focused, x, 256) > 0) focusedOpaque++;
    }
    assertEquals(472, plainOpaque);
    assertTrue(focusedOpaque < plainOpaque, "el desplazamiento recorta la parte que sale del lienzo");
  }

  @Test
  void focusedNormalizedRejectsInvisibleImage() {
    var error = assertThrows(EngineException.class,
        () -> ImageTransforms.normalized(png(16, 16, 0, 0, 0, 0, RED), 0L));
    assertEquals("Visual asset does not contain enough visible pixels", error.getMessage());
  }

  @Test
  void silhouetteIs320WithBlackRgbAndPreservedAlpha() {
    var out = decode(ImageTransforms.silhouette(png(64, 64, 8, 8, 40, 20, 0x80FF8800)));
    assertEquals(320, out.getWidth());
    assertEquals(320, out.getHeight());
    int visible = 0;
    for (int y = 0; y < 320; y++) for (int x = 0; x < 320; x++) {
      int argb = out.getRGB(x, y);
      if (argb >>> 24 > 0) {
        visible++;
        assertEquals(0, argb & 0xFFFFFF, "RGB de la silueta en (" + x + "," + y + ")");
      }
    }
    assertTrue(visible > 0);
    assertEquals(0x80, alpha(out, 160, 160));
    assertEquals(0, alpha(out, 160, 0));
  }

  @Test
  void zoomCropIs512AndValidatesMagnification() {
    var source = png(64, 64, 8, 8, 48, 48, RED);
    var out = decode(ImageTransforms.zoomCrop(source, 0, 4));
    assertEquals(512, out.getWidth());
    assertEquals(512, out.getHeight());
    for (double zoom : new double[] {0.5, 33, Double.NaN, Double.POSITIVE_INFINITY}) {
      var error = assertThrows(EngineException.class, () -> ImageTransforms.zoomCrop(source, 0, zoom));
      assertEquals("Invalid crop magnification", error.getMessage());
    }
  }

  @Test
  void pixelArtUsesNearestNeighbourBlocks() {
    var image = new BufferedImage(4, 4, BufferedImage.TYPE_INT_ARGB);
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) image.setRGB(x, y, 0xFF3366CC);
    image.setRGB(1, 0, 0xFF22AA44);
    var out = decode(ImageTransforms.pixelArt(encode(image), null));
    assertEquals(192, out.getWidth());
    assertEquals(192, out.getHeight());
    assertEquals(0xFF3366CC, out.getRGB(0, 0));
    assertEquals(0xFF3366CC, out.getRGB(47, 47));
    assertEquals(0xFF22AA44, out.getRGB(48, 0));
    assertEquals(0xFF22AA44, out.getRGB(95, 47));
    assertEquals(0xFF3366CC, out.getRGB(96, 0));
  }

  @Test
  void pixelArtContainsNonSquareSprites() {
    var out = decode(ImageTransforms.pixelArt(png(4, 2, 0, 0, 4, 2, RED), null));
    assertEquals(192, out.getWidth());
    assertEquals(192, out.getHeight());
    assertEquals(0, alpha(out, 96, 0));
    assertEquals(RED, out.getRGB(96, 96));
  }

  @Test
  void paletteRecolorAppliesFormulaAtNativeResolution() {
    var out = decode(ImageTransforms.pixelArt(png(2, 2, 0, 0, 2, 2, RED), new Recolor(120, 1, 1, 1)));
    assertEquals(0xFF0FF00F, out.getRGB(10, 10));
  }
}

package es.pokemonuniverse.adapters.out.storage;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import javax.imageio.ImageIO;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/**
 * Formatos reales generados con sharp (perfil P3, JPEG progresivo y mozjpeg, CMYK, datos tras EOI, PNG de paleta, de
 * 16 bits, entrelazado, gris con alfa, WebP sin pérdida y con metadatos) en {@code src/test/resources/avatars}. Origen
 * 160×120: mitad izquierda roja, derecha azul, con ruido y una franja superior de alfa 128. sharp los acepta todos; las
 * esquinas esperadas son las de su salida ({@code rotate().resize(256, 256, cover)}).
 */
class AvatarImageProcessorFixturesTest {

  private static byte[] fixture(String name) throws IOException {
    try (InputStream in = AvatarImageProcessorFixturesTest.class.getResourceAsStream("/avatars/" + name)) {
      if (in == null) throw new IOException("Falta la fixture " + name);
      return in.readAllBytes();
    }
  }

  private static String dominant(int argb) {
    int r = (argb >> 16) & 0xFF;
    int g = (argb >> 8) & 0xFF;
    int b = argb & 0xFF;
    if (r > 150 && r > b + 80) return "red";
    if (b > 120 && b > r + 60) return "blue";
    if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20) return "gray";
    return r + "," + g + "," + b;
  }

  private record Case(String name, String type, String topRight, int topRightAlpha, String bottomLeft) {}

  private static final List<Case> CASES = List.of(
      new Case("p3-orient6-progressive.jpg", "image/jpeg", "red", 255, "blue"),
      new Case("mozjpeg.jpg", "image/jpeg", "blue", 255, "red"),
      new Case("cmyk.jpg", "image/jpeg", "blue", 255, "red"),
      new Case("trailing-data.jpg", "image/jpeg", "blue", 255, "red"),
      new Case("palette-alpha.png", "image/png", "blue", 128, "red"),
      new Case("rgb16.png", "image/png", "blue", 255, "red"),
      new Case("interlaced.png", "image/png", "blue", 255, "red"),
      new Case("gray-alpha.png", "image/png", "gray", 128, "gray"),
      new Case("p3.png", "image/png", "blue", 255, "red"),
      new Case("lossless-alpha.webp", "image/webp", "blue", 128, "red"),
      new Case("lossy-alpha-metadata.webp", "image/webp", "blue", 128, "red"));

  @TestFactory
  Stream<DynamicTest> acceptsWhatSharpAccepts() {
    return CASES.stream().map(c -> DynamicTest.dynamicTest(c.name(),
        () -> accepts(c.name(), c.type(), c.topRight(), c.topRightAlpha(), c.bottomLeft())));
  }

  private static void accepts(String name, String type, String topRight, int topRightAlpha, String bottomLeft)
      throws IOException {
    byte[] webp = new AvatarImageProcessor().toAvatarWebp(fixture(name), type);
    BufferedImage out = ImageIO.read(new ByteArrayInputStream(webp));
    assertEquals(256, out.getWidth());
    assertEquals(256, out.getHeight());
    int tr = out.getRGB(245, 10);
    int bl = out.getRGB(10, 245);
    assertEquals(topRight, dominant(tr), "esquina superior derecha");
    assertEquals(bottomLeft, dominant(bl), "esquina inferior izquierda");
    int alpha = tr >>> 24;
    assertTrue(Math.abs(alpha - topRightAlpha) <= 8, "alfa " + alpha + " frente a " + topRightAlpha);
    assertTrue((bl >>> 24) >= 247, "alfa opaco abajo");
  }
}

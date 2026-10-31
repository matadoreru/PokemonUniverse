package es.pokemonuniverse.domain.game.assets;

import es.pokemonuniverse.domain.game.engine.AssetResolution.Recolor;
import es.pokemonuniverse.domain.game.engine.EngineException;
import io.micronaut.core.annotation.Nullable;
import java.awt.AlphaComposite;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import javax.imageio.ImageIO;

/**
 * Transformaciones de {@code game-image-cache.ts} con el JDK ({@code javax.imageio} y Java2D) en lugar de sharp. La
 * paridad es por propiedades, no por bytes (constraint 18 de la 2B): tamaño del lienzo, alfa conservado, silueta con
 * RGB 0, recorte antes de codificar, recoloreado con la fórmula exacta y punto de foco con el algoritmo exacto.
 * Entrada y salida son PNG; internamente se trabaja en {@code TYPE_INT_ARGB} no premultiplicado.
 */
public final class ImageTransforms {

  static final int NORMALIZED_INNER = 472;
  static final int NORMALIZED_MARGIN = 20;
  static final int NORMALIZED_SIZE = NORMALIZED_INNER + 2 * NORMALIZED_MARGIN;
  static final int SILHOUETTE_SIZE = 320;
  static final int PIXEL_ART_SIZE = 192;

  private ImageTransforms() {}

  /**
   * Recorta los bordes transparentes, encaja en 472×472 (bilineal), añade un margen de 20 hasta 512×512 y, con
   * {@code focusSeed}, desplaza la imagen para que el punto de foco quede en el centro.
   */
  public static byte[] normalized(byte[] source, @Nullable Long focusSeed) {
    return encode(normalizedImage(decode(source), focusSeed));
  }

  /** Recorta antes de codificar para que los píxeles ocultos no se recuperen cambiando el CSS. */
  public static byte[] zoomCrop(byte[] source, long focusSeed, double zoom) {
    if (!Double.isFinite(zoom) || zoom < 1 || zoom > 32) throw new EngineException("Invalid crop magnification");
    var normalized = normalizedImage(decode(source), focusSeed);
    int size = (int) Math.max(1, Math.floor(NORMALIZED_SIZE / zoom));
    int inset = Math.floorDiv(NORMALIZED_SIZE - size, 2);
    var crop = normalized.getSubimage(inset, inset, size, size);
    var out = canvas(NORMALIZED_SIZE, NORMALIZED_SIZE);
    draw(out, crop, 0, 0, NORMALIZED_SIZE, NORMALIZED_SIZE, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
    return encode(out);
  }

  /** Silueta negra de 320×320 con el alfa original; no conserva ningún RGB del origen. */
  public static byte[] silhouette(byte[] source) {
    var image = contain(trim(decode(source)), SILHOUETTE_SIZE, SILHOUETTE_SIZE,
        RenderingHints.VALUE_INTERPOLATION_BILINEAR);
    int[] pixels = pixels(image);
    for (int index = 0; index < pixels.length; index++) pixels[index] &= 0xFF000000;
    image.setRGB(0, 0, image.getWidth(), image.getHeight(), pixels, 0, image.getWidth());
    return encode(image);
  }

  /** Recolorea a resolución nativa y luego encaja en 192×192 con vecino más próximo (bloques nítidos). */
  public static byte[] pixelArt(byte[] source, @Nullable Recolor recolor) {
    var image = decode(source);
    if (recolor != null) {
      int[] pixels = pixels(image);
      HslColors.recolor(pixels, recolor);
      image.setRGB(0, 0, image.getWidth(), image.getHeight(), pixels, 0, image.getWidth());
    }
    return encode(contain(image, PIXEL_ART_SIZE, PIXEL_ART_SIZE,
        RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR));
  }

  private static BufferedImage normalizedImage(BufferedImage source, @Nullable Long focusSeed) {
    var inner = contain(trim(source), NORMALIZED_INNER, NORMALIZED_INNER, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
    var normalized = canvas(NORMALIZED_SIZE, NORMALIZED_SIZE);
    draw(normalized, inner, NORMALIZED_MARGIN, NORMALIZED_MARGIN, NORMALIZED_INNER, NORMALIZED_INNER, null);
    if (focusSeed == null) return normalized;
    int width = normalized.getWidth();
    int height = normalized.getHeight();
    int[] pixels = pixels(normalized);
    var alpha = new byte[pixels.length];
    for (int index = 0; index < pixels.length; index++) alpha[index] = (byte) (pixels[index] >>> 24);
    var focus = FocusPoints.validFocusPoint(new AlphaPlane(width, height, alpha), focusSeed)
        .orElseThrow(() -> new EngineException("Visual asset does not contain enough visible pixels"));
    long offsetX = Math.round(width / 2.0 - focus.x() * width);
    long offsetY = Math.round(height / 2.0 - focus.y() * height);
    var shifted = new int[pixels.length];
    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) {
        long targetX = x + offsetX;
        long targetY = y + offsetY;
        if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue;
        shifted[(int) (targetY * width + targetX)] = pixels[y * width + x];
      }
    }
    var out = canvas(width, height);
    out.setRGB(0, 0, width, height, shifted, 0, width);
    return out;
  }

  /**
   * Aproximación del {@code trim} de sharp contra fondo transparente: con la tolerancia por defecto, sharp retira los
   * bordes totalmente transparentes, así que se recorta a la caja de los píxeles con alfa mayor que 0. Una imagen
   * totalmente transparente se devuelve sin recortar.
   */
  static BufferedImage trim(BufferedImage image) {
    int width = image.getWidth();
    int height = image.getHeight();
    int[] pixels = pixels(image);
    int minX = width;
    int minY = height;
    int maxX = -1;
    int maxY = -1;
    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) {
        if (pixels[y * width + x] >>> 24 == 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < 0) return image;
    return image.getSubimage(minX, minY, maxX - minX + 1, maxY - minY + 1);
  }

  /** {@code fit: 'contain', position: 'centre'} sobre fondo transparente. */
  static BufferedImage contain(BufferedImage image, int width, int height, Object interpolation) {
    double scale = Math.min((double) width / image.getWidth(), (double) height / image.getHeight());
    int scaledWidth = (int) Math.max(1, Math.min(width, Math.round(image.getWidth() * scale)));
    int scaledHeight = (int) Math.max(1, Math.min(height, Math.round(image.getHeight() * scale)));
    var out = canvas(width, height);
    draw(out, image, (width - scaledWidth) / 2, (height - scaledHeight) / 2, scaledWidth, scaledHeight, interpolation);
    return out;
  }

  private static void draw(BufferedImage target, BufferedImage image, int x, int y, int width, int height,
      @Nullable Object interpolation) {
    var graphics = target.createGraphics();
    try {
      graphics.setComposite(AlphaComposite.Src);
      if (interpolation != null) graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, interpolation);
      graphics.drawImage(image, x, y, width, height, null);
    } finally {
      graphics.dispose();
    }
  }

  private static BufferedImage canvas(int width, int height) {
    return new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
  }

  private static int[] pixels(BufferedImage image) {
    return image.getRGB(0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth());
  }

  /** Decodifica cualquier formato de ImageIO a ARGB no premultiplicado ({@code ensureAlpha} de sharp). */
  public static BufferedImage decode(byte[] source) {
    BufferedImage image;
    try {
      image = ImageIO.read(new ByteArrayInputStream(source));
    } catch (IOException e) {
      throw new EngineException("Unsupported game image format");
    }
    if (image == null) throw new EngineException("Unsupported game image format");
    if (image.getType() == BufferedImage.TYPE_INT_ARGB) return image;
    var argb = canvas(image.getWidth(), image.getHeight());
    draw(argb, image, 0, 0, image.getWidth(), image.getHeight(), null);
    return argb;
  }

  static byte[] encode(BufferedImage image) {
    try {
      var out = new ByteArrayOutputStream();
      ImageIO.write(image, "png", out);
      return out.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

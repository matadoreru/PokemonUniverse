package es.pokemonuniverse.tools;

import es.pokemonuniverse.adapters.out.storage.AvatarImageProcessor;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;

/**
 * Prueba de humo del codificador WebP nativo (libwebp de {@code webp-imageio}) en la imagen publicada. CI la ejecuta
 * en la imagen {@code linux/arm64} bajo QEMU, con el sistema de archivos de solo lectura y {@code /tmp} en tmpfs como en
 * compose, sin arrancar Micronaut:
 *
 * <pre>docker run --platform linux/arm64 --entrypoint java IMAGEN --enable-native-access=ALL-UNNAMED \
 *   -cp /app/app.jar es.pokemonuniverse.tools.WebpEncoderSmoke</pre>
 *
 * Codifica un PNG pequeño con el mismo {@link AvatarImageProcessor} que los avatares y sale con 0 si el resultado es un
 * WebP de 256×256; con 1 en cualquier otro caso.
 */
public final class WebpEncoderSmoke {

  private WebpEncoderSmoke() {}

  public static void main(String[] args) {
    System.exit(run(System.out));
  }

  /** Código de salida: 0 si el WebP es correcto, 1 si no. */
  static int run(PrintStream out) {
    try {
      var webp = encodeSample();
      if (!isWebp(webp)) {
        out.println("WebP KO: la salida no empieza por RIFF…WEBP");
        return 1;
      }
      int side = side(webp);
      if (side != 256) {
        out.println("WebP KO: " + side + " px de lado, se esperaban 256");
        return 1;
      }
      out.println("WebP OK: " + webp.length + " bytes, 256×256, " + System.getProperty("os.arch"));
      return 0;
    } catch (RuntimeException | LinkageError e) {
      out.println("WebP KO: " + e);
      e.printStackTrace(out);
      return 1;
    }
  }

  /** PNG de 96×96 con un degradado, codificado como avatar. */
  static byte[] encodeSample() {
    var image = new BufferedImage(96, 96, BufferedImage.TYPE_INT_RGB);
    for (int y = 0; y < 96; y++) {
      for (int x = 0; x < 96; x++) image.setRGB(x, y, new Color(x * 2, y * 2, 128).getRGB());
    }
    var png = new ByteArrayOutputStream();
    try {
      ImageIO.write(image, "png", png);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    return new AvatarImageProcessor().toAvatarWebp(png.toByteArray(), "image/png");
  }

  static boolean isWebp(byte[] bytes) {
    return bytes.length > 12
        && "RIFF".equals(new String(bytes, 0, 4, StandardCharsets.US_ASCII))
        && "WEBP".equals(new String(bytes, 8, 4, StandardCharsets.US_ASCII));
  }

  /** Ancho del WebP leído de su cabecera. */
  static int side(byte[] webp) {
    var readers = ImageIO.getImageReadersByFormatName("webp");
    if (!readers.hasNext()) throw new IllegalStateException("Sin lector WebP");
    var reader = readers.next();
    try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(webp))) {
      reader.setInput(input, true, true);
      return reader.getWidth(0);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    } finally {
      reader.dispose();
    }
  }
}

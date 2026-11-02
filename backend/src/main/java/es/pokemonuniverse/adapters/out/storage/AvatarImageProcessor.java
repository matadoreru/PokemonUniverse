package es.pokemonuniverse.adapters.out.storage;

import com.luciad.imageio.webp.WebPImageWriterSpi;
import com.luciad.imageio.webp.WebPWriteParam;
import com.twelvemonkeys.imageio.metadata.jpeg.JPEG;
import com.twelvemonkeys.imageio.metadata.jpeg.JPEGSegmentUtil;
import com.twelvemonkeys.imageio.metadata.tiff.TIFF;
import com.twelvemonkeys.imageio.metadata.tiff.TIFFReader;
import es.pokemonuniverse.application.avatar.AvatarService;
import es.pokemonuniverse.application.avatar.AvatarValidationException;
import es.pokemonuniverse.application.ports.AvatarImageEncoder;
import jakarta.inject.Singleton;
import java.awt.AlphaComposite;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Arrays;
import java.util.Iterator;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.event.IIOReadWarningListener;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;

/**
 * Equivalente Java de {@code sharp(buf, {failOn: 'warning', limitInputPixels: 4096²}).rotate().resize(256, 256,
 * {fit: 'cover', position: 'centre'}).webp({quality: 84, effort: 5})}.
 *
 * <ul>
 *   <li>El formato se detecta por los bytes mágicos y debe coincidir exactamente con el {@code Content-Type}
 *       declarado. Cada formato usa un lector concreto en Java puro (TwelveMonkeys para JPEG y WebP, el del JDK para
 *       PNG): el lector WebP nativo que registra {@code webp-imageio} nunca ve la entrada del usuario.</li>
 *   <li>Las dimensiones salen de la cabecera ({@code getWidth(0)}/{@code getHeight(0)}) antes de decodificar: más de
 *       4096² píxeles es «archivo no válido» (sharp falla en {@code metadata()}) y un lado fuera de 64..4096 es el
 *       literal de dimensiones. Una bomba de descompresión se rechaza sin reservar su ráster.</li>
 *   <li>La decodificación submuestrea a un lado corto de al menos 512 px: la memoria queda acotada y el reescalado
 *       final a 256 px conserva calidad.</li>
 *   <li>Como {@code failOn: 'warning'}, un aviso de datos corruptos del lector (los de libjpeg: «Corrupt JPEG data…»,
 *       «Truncated File…») invalida la imagen. Los avisos de perfil de color de TwelveMonkeys (CMYK sin ICC) son
 *       informativos: sharp acepta esas imágenes.</li>
 *   <li>Orientación EXIF solo en JPEG, leída con {@code imageio-metadata} de TwelveMonkeys (ya en el classpath por
 *       {@code imageio-jpeg}); los EXIF de PNG/WebP son raros en fotos de móvil y se ignoran.</li>
 * </ul>
 */
@Singleton
public class AvatarImageProcessor implements AvatarImageEncoder {

  static final int MIN_SIDE = 64;
  static final int MAX_SIDE = 4096;
  static final long MAX_PIXELS = (long) MAX_SIDE * MAX_SIDE;
  static final int OUTPUT_SIDE = 256;
  static final float QUALITY = 0.84f;
  /** {@code effort: 5} de sharp es el {@code method} de libwebp. */
  static final int METHOD = 5;

  private enum Format {
    JPEG("image/jpeg"),
    PNG("image/png"),
    WEBP("image/webp");

    final String contentType;

    Format(String contentType) {
      this.contentType = contentType;
    }

    static Format sniff(byte[] b) {
      if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) return JPEG;
      if (b.length >= 8 && Arrays.equals(b, 0, 8, new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, 0, 8)) {
        return PNG;
      }
      if (b.length >= 12 && Arrays.equals(b, 0, 4, new byte[] {'R', 'I', 'F', 'F'}, 0, 4)
          && Arrays.equals(b, 8, 12, new byte[] {'W', 'E', 'B', 'P'}, 0, 4)) {
        return WEBP;
      }
      return null;
    }
  }

  @Override
  public byte[] toAvatarWebp(byte[] contents, String declaredContentType) {
    var format = Format.sniff(contents);
    if (format == null || !format.contentType.equals(declaredContentType)) throw invalid();
    ImageReader reader = newReader(format);
    var warned = new AtomicBoolean();
    reader.addIIOReadWarningListener((IIOReadWarningListener) (source, warning) -> {
      if (!isColourProfileNotice(warning)) warned.set(true);
    });
    try (ImageInputStream input = new MemoryCacheImageInputStream(new ByteArrayInputStream(contents))) {
      reader.setInput(input, true, true);
      int width;
      int height;
      try {
        width = reader.getWidth(0);
        height = reader.getHeight(0);
      } catch (IOException | RuntimeException e) {
        throw invalid();
      }
      if (width <= 0 || height <= 0 || (long) width * height > MAX_PIXELS) throw invalid();
      if (width < MIN_SIDE || height < MIN_SIDE || width > MAX_SIDE || height > MAX_SIDE) {
        throw new AvatarValidationException(AvatarService.INVALID_DIMENSIONS);
      }
      var param = reader.getDefaultReadParam();
      int step = Math.max(1, Math.min(width, height) / (OUTPUT_SIDE * 2));
      if (step > 1) param.setSourceSubsampling(step, step, 0, 0);
      BufferedImage decoded;
      try {
        decoded = reader.read(0, param);
      } catch (IOException | RuntimeException e) {
        throw invalid();
      }
      if (warned.get() || decoded == null) throw invalid();
      int orientation = format == Format.JPEG ? exifOrientation(contents) : 1;
      return encode(cover(orient(decoded, orientation)));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    } finally {
      reader.dispose();
    }
  }

  private static ImageReader newReader(Format format) {
    return switch (format) {
      case JPEG -> registeredReader("jpeg", "com.twelvemonkeys.imageio.plugins.jpeg.");
      case WEBP -> registeredReader("webp", "com.twelvemonkeys.imageio.plugins.webp.");
      case PNG -> registeredReader("png", "com.sun.imageio.plugins.png.");
    };
  }

  /**
   * El lector registrado cuyo paquete se pide. Se busca en el registro (el SPI JPEG de TwelveMonkeys necesita
   * registrarse para encontrar su delegado del JDK) y por paquete, para no depender del orden de los SPI.
   */
  private static ImageReader registeredReader(String formatName, String packagePrefix) {
    Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(formatName);
    while (readers.hasNext()) {
      var candidate = readers.next();
      if (candidate.getClass().getName().startsWith(packagePrefix)) return candidate;
    }
    throw new IllegalStateException("Sin lector " + packagePrefix + " para " + formatName);
  }

  /** Aviso informativo sobre el perfil de color (p. ej. «No embedded ICC color profile…» de un JPEG CMYK). */
  static boolean isColourProfileNotice(String warning) {
    var text = warning == null ? "" : warning.toLowerCase(Locale.ROOT);
    return text.contains("icc") || text.contains("color profile") || text.contains("colour profile");
  }

  private static AvatarValidationException invalid() {
    return new AvatarValidationException(AvatarService.INVALID_IMAGE);
  }

  /** Etiqueta 0x0112 del primer APP1 {@code Exif}; 1 si falta o no se puede leer (como sharp, que la ignora). */
  static int exifOrientation(byte[] jpeg) {
    try (ImageInputStream input = new MemoryCacheImageInputStream(new ByteArrayInputStream(jpeg))) {
      var segments = JPEGSegmentUtil.readSegments(input, JPEG.APP1, "Exif");
      if (segments.isEmpty()) return 1;
      var data = new DataInputStream(segments.getFirst().data());
      // Tras el identificador "Exif\0" queda un byte de relleno antes de la cabecera TIFF.
      if (data.read() < 0) return 1;
      try (ImageInputStream tiff = new MemoryCacheImageInputStream(data)) {
        var entry = new TIFFReader().read(tiff).getEntryById(TIFF.TAG_ORIENTATION);
        if (entry == null || !(entry.getValue() instanceof Number value)) return 1;
        int orientation = value.intValue();
        return orientation >= 1 && orientation <= 8 ? orientation : 1;
      }
    } catch (IOException | RuntimeException e) {
      return 1;
    }
  }

  /** Aplica la orientación EXIF (1..8) para dejar la imagen como se ve. */
  static BufferedImage orient(BufferedImage source, int orientation) {
    if (orientation <= 1) return source;
    int w = source.getWidth();
    int h = source.getHeight();
    boolean swap = orientation >= 5;
    var transform = new AffineTransform();
    switch (orientation) {
      case 2 -> transform.setTransform(-1, 0, 0, 1, w, 0);
      case 3 -> transform.setTransform(-1, 0, 0, -1, w, h);
      case 4 -> transform.setTransform(1, 0, 0, -1, 0, h);
      case 5 -> transform.setTransform(0, 1, 1, 0, 0, 0);
      case 6 -> transform.setTransform(0, 1, -1, 0, h, 0);
      case 7 -> transform.setTransform(0, -1, -1, 0, h, w);
      case 8 -> transform.setTransform(0, -1, 1, 0, 0, w);
      default -> {
        return source;
      }
    }
    var target = blank(swap ? h : w, swap ? w : h, source.getColorModel().hasAlpha());
    Graphics2D g = target.createGraphics();
    try {
      g.setComposite(AlphaComposite.Src);
      g.drawImage(source, transform, null);
    } finally {
      g.dispose();
    }
    return target;
  }

  /** {@code fit: 'cover', position: 'centre'}: recorte cuadrado centrado y reescalado a 256×256. */
  static BufferedImage cover(BufferedImage source) {
    int side = Math.min(source.getWidth(), source.getHeight());
    BufferedImage current = source.getSubimage((source.getWidth() - side) / 2, (source.getHeight() - side) / 2, side, side);
    boolean alpha = source.getColorModel().hasAlpha();
    // Reducción por mitades con bilineal (sin el aliasing de un solo salto grande) y último paso bicúbico.
    while (current.getWidth() / 2 >= OUTPUT_SIDE) {
      current = draw(current, current.getWidth() / 2, alpha, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
    }
    return draw(current, OUTPUT_SIDE, alpha, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
  }

  private static BufferedImage draw(BufferedImage source, int side, boolean alpha, Object interpolation) {
    var target = blank(side, side, alpha);
    Graphics2D g = target.createGraphics();
    try {
      g.setComposite(AlphaComposite.Src);
      g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, interpolation);
      g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
      g.drawImage(source, 0, 0, side, side, null);
    } finally {
      g.dispose();
    }
    return target;
  }

  private static BufferedImage blank(int width, int height, boolean alpha) {
    return new BufferedImage(width, height, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
  }

  private static byte[] encode(BufferedImage image) {
    var writer = new WebPImageWriterSpi().createWriterInstance(null);
    try {
      var param = new WebPWriteParam(Locale.ROOT);
      param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
      param.setCompressionType("Lossy");
      param.setCompressionQuality(QUALITY);
      param.setMethod(METHOD);
      var out = new ByteArrayOutputStream();
      try (var stream = new MemoryCacheImageOutputStream(out)) {
        writer.setOutput(stream);
        writer.write(null, new IIOImage(image, null, null), param);
      }
      return out.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    } finally {
      writer.dispose();
    }
  }
}

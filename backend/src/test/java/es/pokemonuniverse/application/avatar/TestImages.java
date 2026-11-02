package es.pokemonuniverse.application.avatar;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.util.zip.CRC32;
import java.util.zip.Deflater;
import javax.imageio.ImageIO;

/** Imágenes de prueba generadas en memoria (PNG/JPEG del JDK y PNG con solo cabecera). */
public final class TestImages {

  private TestImages() {}

  public static byte[] png(int width, int height, Color color) {
    var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
    fill(image, 0, 0, width, height, color);
    return encode(image, "png");
  }

  /** Mitad izquierda {@code left}, mitad derecha {@code right}. */
  public static BufferedImage halves(int width, int height, Color left, Color right) {
    var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
    fill(image, 0, 0, width / 2, height, left);
    fill(image, width / 2, 0, width - width / 2, height, right);
    return image;
  }

  /** PNG con canal alfa: mitad izquierda transparente, mitad derecha roja opaca. */
  public static byte[] transparentPng(int width, int height) {
    var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) image.setRGB(x, y, x < width / 2 ? 0x00000000 : 0xFFFF0000);
    }
    return encode(image, "png");
  }

  public static byte[] encode(BufferedImage image, String format) {
    var out = new ByteArrayOutputStream();
    try {
      if (!ImageIO.write(image, format, out)) throw new IllegalStateException("Sin escritor " + format);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    return out.toByteArray();
  }

  /**
   * JPEG con un segmento APP1 Exif cuya única entrada es la orientación (etiqueta 0x0112), insertado justo detrás del
   * SOI.
   */
  public static byte[] jpegWithOrientation(BufferedImage image, int orientation) {
    byte[] jpeg = encode(image, "jpeg");
    var tiff = ByteBuffer.allocate(8 + 2 + 12 + 4);
    tiff.put(new byte[] {'M', 'M', 0, 42}).putInt(8);
    tiff.putShort((short) 1);
    tiff.putShort((short) 0x0112).putShort((short) 3).putInt(1).putShort((short) orientation).putShort((short) 0);
    tiff.putInt(0);
    byte[] exifHeader = {'E', 'x', 'i', 'f', 0, 0};
    int length = 2 + exifHeader.length + tiff.capacity();
    var out = new ByteArrayOutputStream();
    out.write(jpeg, 0, 2);
    out.write(0xFF);
    out.write(0xE1);
    out.write(length >> 8);
    out.write(length & 0xFF);
    out.writeBytes(exifHeader);
    out.writeBytes(tiff.array());
    out.write(jpeg, 2, jpeg.length - 2);
    return out.toByteArray();
  }

  /** PNG válido hasta la cabecera, con un IDAT mínimo: decodificarlo entero exigiría un ráster de width×height. */
  public static byte[] pngHeaderOnly(int width, int height) {
    var out = new ByteArrayOutputStream();
    out.writeBytes(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
    var ihdr = ByteBuffer.allocate(13).putInt(width).putInt(height).put((byte) 8).put((byte) 2)
        .put((byte) 0).put((byte) 0).put((byte) 0);
    chunk(out, "IHDR", ihdr.array());
    var deflater = new Deflater();
    deflater.setInput(new byte[64]);
    deflater.finish();
    byte[] idat = new byte[128];
    int n = deflater.deflate(idat);
    chunk(out, "IDAT", java.util.Arrays.copyOf(idat, n));
    chunk(out, "IEND", new byte[0]);
    return out.toByteArray();
  }

  /**
   * Bomba de descompresión válida: PNG gris de 1 bit, {@code width×height} píxeles a cero, con un IDAT completo que
   * ocupa unos pocos KB. Se decodificaría sin error, así que solo la cabecera puede rechazarla.
   */
  public static byte[] pngBomb(int width, int height) {
    var out = new ByteArrayOutputStream();
    out.writeBytes(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
    var ihdr = ByteBuffer.allocate(13).putInt(width).putInt(height).put((byte) 1).put((byte) 0)
        .put((byte) 0).put((byte) 0).put((byte) 0);
    chunk(out, "IHDR", ihdr.array());
    var deflater = new Deflater(Deflater.BEST_COMPRESSION);
    byte[] row = new byte[1 + (width + 7) / 8];
    var idat = new ByteArrayOutputStream();
    byte[] buffer = new byte[64 * 1024];
    for (int y = 0; y < height; y++) {
      deflater.setInput(row);
      while (!deflater.needsInput()) idat.write(buffer, 0, deflater.deflate(buffer));
    }
    deflater.finish();
    while (!deflater.finished()) idat.write(buffer, 0, deflater.deflate(buffer));
    chunk(out, "IDAT", idat.toByteArray());
    chunk(out, "IEND", new byte[0]);
    return out.toByteArray();
  }

  private static void chunk(ByteArrayOutputStream out, String type, byte[] data) {
    out.writeBytes(ByteBuffer.allocate(4).putInt(data.length).array());
    byte[] typed = new byte[4 + data.length];
    System.arraycopy(type.getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, typed, 0, 4);
    System.arraycopy(data, 0, typed, 4, data.length);
    out.writeBytes(typed);
    var crc = new CRC32();
    crc.update(typed);
    out.writeBytes(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
  }

  private static void fill(BufferedImage image, int x0, int y0, int w, int h, Color color) {
    for (int y = y0; y < y0 + h; y++) {
      for (int x = x0; x < x0 + w; x++) image.setRGB(x, y, color.getRGB());
    }
  }
}

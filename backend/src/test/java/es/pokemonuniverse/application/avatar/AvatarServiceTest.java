package es.pokemonuniverse.application.avatar;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.storage.AvatarImageProcessor;
import es.pokemonuniverse.adapters.out.storage.FilesystemAvatarStorage;
import es.pokemonuniverse.application.errors.BadRequestException;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Duration;
import java.util.Arrays;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.junit.jupiter.api.io.TempDir;

class AvatarServiceTest {

  private static final String TOO_BIG = "La imagen supera el límite de 5 MB.";
  private static final String INVALID = "El archivo no es una imagen JPEG, PNG o WEBP válida.";
  private static final String DIMENSIONS = "La imagen debe medir entre 64 y 4096 píxeles por lado.";

  @TempDir Path dir;

  private AvatarService service() {
    return new AvatarService(new AvatarImageProcessor(), new FilesystemAvatarStorage(dir.resolve("avatars")));
  }

  private static BufferedImage decode(byte[] webp) throws IOException {
    var image = ImageIO.read(new ByteArrayInputStream(webp));
    if (image == null) throw new IOException("WebP ilegible");
    return image;
  }

  private void rejects(String message, Executable action) {
    var error = assertThrows(AvatarValidationException.class, action);
    assertEquals(message, error.getMessage());
    assertInstanceOf(BadRequestException.class, error);
  }

  private static boolean near(int rgb, Color expected) {
    var c = new Color(rgb, true);
    return Math.abs(c.getRed() - expected.getRed()) < 40 && Math.abs(c.getGreen() - expected.getGreen()) < 40
        && Math.abs(c.getBlue() - expected.getBlue()) < 40;
  }

  @Test
  void png64BecomesWebp256StoredWith0600() throws IOException {
    long before = System.currentTimeMillis();
    var avatar = service().processAndStore(TestImages.png(64, 64, Color.BLUE), "image/png");
    assertTrue(avatar.value().matches("^[0-9a-f-]{36}\\.webp$"), avatar.value());
    assertTrue(avatar.version() >= before);
    var file = dir.resolve("avatars").resolve(avatar.value());
    byte[] bytes = Files.readAllBytes(file);
    assertEquals("RIFF", new String(bytes, 0, 4, java.nio.charset.StandardCharsets.US_ASCII));
    assertEquals("WEBP", new String(bytes, 8, 4, java.nio.charset.StandardCharsets.US_ASCII));
    var image = decode(bytes);
    assertEquals(256, image.getWidth());
    assertEquals(256, image.getHeight());
    assertTrue(near(image.getRGB(128, 128), Color.BLUE));
    assertEquals("rw-------", PosixFilePermissions.toString(Files.getPosixFilePermissions(file)));
  }

  @Test
  void coverCropsTheCentreOfWideImages() throws IOException {
    // 300×100: rojo | azul | rojo en tercios; el recorte central cuadrado es todo azul.
    var image = new BufferedImage(300, 100, BufferedImage.TYPE_INT_RGB);
    for (int y = 0; y < 100; y++) {
      for (int x = 0; x < 300; x++) image.setRGB(x, y, x >= 100 && x < 200 ? Color.BLUE.getRGB() : Color.RED.getRGB());
    }
    var avatar = service().processAndStore(TestImages.encode(image, "png"), "image/png");
    var out = decode(Files.readAllBytes(dir.resolve("avatars").resolve(avatar.value())));
    assertTrue(near(out.getRGB(8, 8), Color.BLUE));
    assertTrue(near(out.getRGB(247, 247), Color.BLUE));
  }

  @Test
  void keepsTransparency() throws IOException {
    var avatar = service().processAndStore(TestImages.transparentPng(128, 128), "image/png");
    var out = decode(Files.readAllBytes(dir.resolve("avatars").resolve(avatar.value())));
    assertEquals(0, out.getRGB(10, 128) >>> 24);
    assertEquals(255, out.getRGB(245, 128) >>> 24);
  }

  @Test
  void acceptsWebpInput() throws IOException {
    var first = service().processAndStore(TestImages.png(100, 100, Color.GREEN), "image/png");
    byte[] webp = Files.readAllBytes(dir.resolve("avatars").resolve(first.value()));
    var second = service().processAndStore(webp, "image/webp");
    assertEquals(256, decode(Files.readAllBytes(dir.resolve("avatars").resolve(second.value()))).getWidth());
  }

  @Test
  void jpegExifOrientation6IsRotatedClockwise() throws IOException {
    // Guardada 200×100 (izquierda roja, derecha azul); con orientación 6 se ve 100×200: arriba roja, abajo azul.
    byte[] jpeg = TestImages.jpegWithOrientation(TestImages.halves(200, 100, Color.RED, Color.BLUE), 6);
    var avatar = service().processAndStore(jpeg, "image/jpeg");
    var out = decode(Files.readAllBytes(dir.resolve("avatars").resolve(avatar.value())));
    assertTrue(near(out.getRGB(245, 10), Color.RED), "esquina superior derecha roja");
    assertTrue(near(out.getRGB(10, 245), Color.BLUE), "esquina inferior izquierda azul");
  }

  @Test
  void rejects63PixelSides() {
    rejects(DIMENSIONS, () -> service().processAndStore(TestImages.png(63, 63, Color.RED), "image/png"));
    rejects(DIMENSIONS, () -> service().processAndStore(TestImages.png(64, 63, Color.RED), "image/png"));
  }

  @Test
  void rejectsSidesAbove4096FromTheHeaderAlone() {
    // 5000×100 está bajo el límite de píxeles de sharp (4096²): Node responde el literal de dimensiones.
    rejects(DIMENSIONS, () -> service().processAndStore(TestImages.pngHeaderOnly(5000, 100), "image/png"));
  }

  @Test
  void decompressionBombIsRejectedFromTheHeaderWithoutDecodingIt() {
    // 20000×20000 supera limitInputPixels (4096²): sharp falla en metadata() y Node da el literal de archivo inválido.
    byte[] bomb = TestImages.pngBomb(20_000, 20_000);
    assertTrue(bomb.length < 200_000, "bomba de " + bomb.length + " bytes");
    assertTimeoutPreemptively(Duration.ofMillis(500),
        () -> rejects(INVALID, () -> service().processAndStore(bomb, "image/png")));
    // Solo el límite de píxeles, antes que el de lados: 4097×4097 también es «archivo no válido» y no de dimensiones.
    rejects(INVALID, () -> service().processAndStore(TestImages.pngBomb(4097, 4097), "image/png"));
  }

  @Test
  void rejectsFormatThatDoesNotMatchTheDeclaredType() {
    rejects(INVALID, () -> service().processAndStore(TestImages.png(64, 64, Color.RED), "image/jpeg"));
    // El formato se comprueba antes que las dimensiones, como en Node.
    rejects(INVALID, () -> service().processAndStore(TestImages.png(63, 63, Color.RED), "image/jpeg"));
    rejects(INVALID, () -> service().processAndStore(TestImages.png(64, 64, Color.RED), "image/png; charset=x"));
    rejects(INVALID, () -> service().processAndStore(TestImages.png(64, 64, Color.RED), "IMAGE/PNG"));
  }

  @Test
  void rejectsUnsupportedOrCorruptContents() {
    rejects(INVALID, () -> service().processAndStore("hello world".getBytes(), "image/png"));
    rejects(INVALID, () -> service().processAndStore(TestImages.encode(TestImages.halves(80, 80, Color.RED, Color.BLUE), "gif"), "image/gif"));
    byte[] jpeg = TestImages.encode(TestImages.halves(300, 200, Color.RED, Color.BLUE), "jpeg");
    rejects(INVALID, () -> service().processAndStore(Arrays.copyOf(jpeg, jpeg.length / 2), "image/jpeg"));
    // «Corrupt JPEG data: 3 extraneous bytes before marker 0xda» de libjpeg: sharp con failOn 'warning' también falla.
    int sos = indexOf(jpeg, (byte) 0xFF, (byte) 0xDA);
    byte[] extraneous = new byte[jpeg.length + 3];
    System.arraycopy(jpeg, 0, extraneous, 0, sos);
    System.arraycopy(jpeg, sos, extraneous, sos + 3, jpeg.length - sos);
    rejects(INVALID, () -> service().processAndStore(extraneous, "image/jpeg"));
  }

  private static int indexOf(byte[] data, byte first, byte second) {
    for (int i = 0; i + 1 < data.length; i++) if (data[i] == first && data[i + 1] == second) return i;
    throw new IllegalArgumentException("marcador ausente");
  }

  @Test
  void rejectsEmptyAndOversizeBodies() {
    rejects(TOO_BIG, () -> service().processAndStore(new byte[0], "image/png"));
    byte[] png = TestImages.png(64, 64, Color.RED);
    byte[] oversize = Arrays.copyOf(png, AvatarService.MAX_UPLOAD_BYTES + 1);
    rejects(TOO_BIG, () -> service().processAndStore(oversize, "image/png"));
  }

  @Test
  void nothingIsStoredWhenRejected() throws IOException {
    rejects(DIMENSIONS, () -> service().processAndStore(TestImages.png(63, 63, Color.RED), "image/png"));
    var avatars = dir.resolve("avatars");
    assertTrue(!Files.exists(avatars) || Files.list(avatars).findAny().isEmpty());
  }

  @Test
  void removeIgnoresMissingFiles() {
    var service = service();
    var avatar = service.processAndStore(TestImages.png(64, 64, Color.RED), "image/png");
    service.remove(avatar.value());
    service.remove(avatar.value());
    assertTrue(Files.notExists(dir.resolve("avatars").resolve(avatar.value())));
  }
}

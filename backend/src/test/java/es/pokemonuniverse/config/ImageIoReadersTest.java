package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.avatar.AvatarService;
import es.pokemonuniverse.application.avatar.TestImages;
import es.pokemonuniverse.application.ports.AvatarStorage;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.test.support.TestPropertyProvider;
import jakarta.inject.Inject;
import java.awt.Color;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/** Con el contexto arrancado, la libwebp nativa solo codifica: ningún decode de ImageIO usa el lector de luciad. */
@MicronautTest(transactional = false)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ImageIoReadersTest implements TestPropertyProvider {

  @Inject AvatarService avatars;
  @Inject AvatarStorage storage;

  private static List<String> readers(String format) {
    var names = new ArrayList<String>();
    for (var it = ImageIO.getImageReadersByFormatName(format); it.hasNext(); ) {
      ImageReader reader = it.next();
      names.add(reader.getClass().getName());
    }
    return names;
  }

  @Test
  void onlyTwelveMonkeysReadsWebp() {
    var names = readers("webp");
    assertFalse(names.isEmpty());
    assertTrue(names.stream().allMatch(n -> n.startsWith("com.twelvemonkeys.")), names.toString());
    assertTrue(readers("image/webp").stream().noneMatch(n -> n.startsWith("com.luciad.")));
  }

  @Test
  void avatarWebpUploadStillWorks() throws Exception {
    var first = avatars.processAndStore(TestImages.png(64, 64, Color.BLUE), "image/png");
    // El WebP del escritor nativo vuelve a entrar como subida y lo lee TwelveMonkeys.
    byte[] webp = storage.read(first.value()).orElseThrow();
    assertEquals(256, ImageIO.read(new ByteArrayInputStream(webp)).getWidth());
    var second = avatars.processAndStore(webp, "image/webp");
    assertEquals(256, ImageIO.read(new ByteArrayInputStream(storage.read(second.value()).orElseThrow())).getHeight());
  }

  @Override
  public Map<String, String> getProperties() {
    try {
      return Map.of("pu.avatar-storage-dir", Files.createTempDirectory("pu-imageio").toString());
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

package es.pokemonuniverse.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/** La prueba de humo que CI ejecuta en la imagen linux/arm64 también funciona en la plataforma de los tests. */
class WebpEncoderSmokeTest {

  @Test
  void encodesTheSamplePngIntoA256SquareWebp() {
    var webp = WebpEncoderSmoke.encodeSample();
    assertEquals("RIFF", new String(webp, 0, 4, StandardCharsets.US_ASCII));
    assertEquals("WEBP", new String(webp, 8, 4, StandardCharsets.US_ASCII));
    assertEquals(256, WebpEncoderSmoke.side(webp));
  }

  @Test
  void runReportsSuccessWithExitCodeZero() {
    var out = new ByteArrayOutputStream();
    assertEquals(0, WebpEncoderSmoke.run(new PrintStream(out, true, StandardCharsets.UTF_8)));
    assertTrue(out.toString(StandardCharsets.UTF_8).startsWith("WebP OK"), out.toString(StandardCharsets.UTF_8));
  }
}

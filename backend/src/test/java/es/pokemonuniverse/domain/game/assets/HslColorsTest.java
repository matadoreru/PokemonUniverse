package es.pokemonuniverse.domain.game.assets;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.domain.game.engine.AssetResolution.Recolor;
import org.junit.jupiter.api.Test;

class HslColorsTest {

  private static int argb(int a, int r, int g, int b) {
    return (a << 24) | (r << 16) | (g << 8) | b;
  }

  @Test
  void recolorsSaturatedRedByHueShift() {
    int[] pixels = {argb(255, 255, 0, 0)};
    HslColors.recolor(pixels, new Recolor(120, 1, 1, 1));
    assertEquals(argb(255, 15, 240, 15), pixels[0]);
  }

  @Test
  void leavesLowChromaAndTransparentPixelsUntouched() {
    int[] pixels = {argb(255, 128, 128, 128), argb(0, 255, 0, 0), argb(255, 5, 0, 0), argb(255, 250, 245, 248)};
    var original = pixels.clone();
    HslColors.recolor(pixels, new Recolor(90, 1.1, 1.1, 1.1));
    assertArrayEquals(original, pixels);
  }

  @Test
  void clampsScalesAndWrapsNegativeHue() {
    int[] shifted = {argb(255, 255, 0, 0)};
    int[] wrapped = {argb(255, 255, 0, 0)};
    // -240 ≡ 120; las escalas fuera de rango se recortan: saturationScale 0.1 se trata como 0.5.
    HslColors.recolor(shifted, new Recolor(120, 0.5, 1, 1));
    HslColors.recolor(wrapped, new Recolor(-240, 0.1, 1, 1));
    assertEquals(shifted[0], wrapped[0]);
  }

  @Test
  void roundTripsHsl() {
    double[] hsl = HslColors.rgbToHsl(0.2, 0.4, 0.8);
    double[] rgb = HslColors.hslToRgb(hsl[0], hsl[1], hsl[2]);
    assertEquals(0.2, rgb[0], 1e-9);
    assertEquals(0.4, rgb[1], 1e-9);
    assertEquals(0.8, rgb[2], 1e-9);
  }
}

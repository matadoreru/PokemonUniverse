package es.pokemonuniverse.domain.game.assets;

import es.pokemonuniverse.domain.game.engine.AssetResolution.Recolor;

/** Conversión HSL y {@code recolorPixels} de {@code game-image-cache.ts}, con los mismos recortes y umbrales. */
public final class HslColors {

  private HslColors() {}

  /** Componentes en [0, 1]; devuelve {@code [hue° ∈ [0,360), saturación, luminosidad]}. */
  public static double[] rgbToHsl(double red, double green, double blue) {
    double maximum = Math.max(red, Math.max(green, blue));
    double minimum = Math.min(red, Math.min(green, blue));
    double lightness = (maximum + minimum) / 2;
    double delta = maximum - minimum;
    if (delta == 0) return new double[] {0, 0, lightness};
    double saturation = delta / (1 - Math.abs(2 * lightness - 1));
    double hue;
    if (maximum == red) hue = ((green - blue) / delta) % 6;
    else if (maximum == green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    return new double[] {((hue * 60) + 360) % 360, saturation, lightness};
  }

  private static double hueChannel(double first, double second, double hue) {
    double wrapped = ((hue % 1) + 1) % 1;
    if (wrapped < 1.0 / 6) return first + (second - first) * 6 * wrapped;
    if (wrapped < 1.0 / 2) return second;
    if (wrapped < 2.0 / 3) return first + (second - first) * (2.0 / 3 - wrapped) * 6;
    return first;
  }

  public static double[] hslToRgb(double hue, double saturation, double lightness) {
    if (saturation == 0) return new double[] {lightness, lightness, lightness};
    double second = lightness < 0.5
        ? lightness * (1 + saturation)
        : lightness + saturation - lightness * saturation;
    double first = 2 * lightness - second;
    double normalizedHue = hue / 360;
    return new double[] {
        hueChannel(first, second, normalizedHue + 1.0 / 3),
        hueChannel(first, second, normalizedHue),
        hueChannel(first, second, normalizedHue - 1.0 / 3)};
  }

  private static double clamp(double value, double minimum, double maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  /** Recolorea en sitio píxeles ARGB no premultiplicados; el alfa nunca cambia. */
  public static void recolor(int[] argb, Recolor recolor) {
    double hueShift = ((recolor.hueShiftDegrees() % 360) + 360) % 360;
    double saturationScale = clamp(recolor.saturationScale(), 0.5, 1.15);
    double lightnessScale = clamp(recolor.lightnessScale(), 0.85, 1.15);
    double contrast = clamp(recolor.contrast(), 0.8, 1.1);
    for (int index = 0; index < argb.length; index++) {
      int pixel = argb[index];
      int alpha = pixel >>> 24;
      if (alpha == 0) continue;
      double red = ((pixel >> 16) & 0xFF) / 255.0;
      double green = ((pixel >> 8) & 0xFF) / 255.0;
      double blue = (pixel & 0xFF) / 255.0;
      double[] hsl = rgbToHsl(red, green, blue);
      double chroma = Math.max(red, Math.max(green, blue)) - Math.min(red, Math.min(green, blue));
      if (chroma < 0.055 || hsl[2] < 0.07 || hsl[2] > 0.94) continue;
      double nextSaturation = clamp(hsl[1] * saturationScale, 0, 0.88);
      double contrastedLightness = 0.5 + (hsl[2] - 0.5) * contrast;
      double nextLightness = clamp(contrastedLightness * lightnessScale, 0.04, 0.96);
      double[] rgb = hslToRgb((hsl[0] + hueShift) % 360, nextSaturation, nextLightness);
      argb[index] = (alpha << 24) | (channel(rgb[0]) << 16) | (channel(rgb[1]) << 8) | channel(rgb[2]);
    }
  }

  /** {@code Math.round(v * 255)} escrito en un {@code Uint8Array} (recorta a [0, 255]). */
  private static int channel(double value) {
    return (int) Math.max(0, Math.min(255, Math.round(value * 255)));
  }
}

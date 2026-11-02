package es.pokemonuniverse.application.datasync.pokemon;

import es.pokemonuniverse.domain.text.Collations;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import javax.imageio.ImageIO;

/**
 * {@code extractPokemonPaletteData} de {@code pokemon-palette-sync.ts}: paleta estable y sensible al alfa de un sprite.
 *
 * <ol>
 *   <li>Encaja la imagen en 96×96 con vecino más próximo y sin ampliar (sharp {@code fit: inside},
 *       {@code withoutEnlargement}, {@code kernel: nearest}) y la lee en RGBA.</li>
 *   <li>Ignora los píxeles con alfa &lt; 96 y los extremos ({@code max(rgb) < 20} o {@code min(rgb) > 248}).</li>
 *   <li>Cuantiza cada canal a {@code round(c/24)*24} con tope 255 y agrupa por color cuantizado.</li>
 *   <li>Ordena los grupos por recuento descendente y después por {@code "r:g:b"} con {@code localeCompare} (colación
 *       ICU: {@code "24:…"} va antes que {@code "240:…"}).</li>
 *   <li>Elige con avidez hasta 8 colores a distancia euclídea ≥ 42 de todos los ya elegidos; con menos de 3 falla.</li>
 *   <li>Pesos: cada grupo suma su recuento al color elegido más cercano (gana el primero en empate), normalizados.</li>
 * </ol>
 *
 * <p>Sin redimensión (sprites de PokéAPI, 96×96) el resultado es idéntico al de Node. Al reducir, el muestreo toma el
 * píxel bajo el centro de cada celda de destino ({@code floor((x + 0.5) * origen / destino)}), que coincidió con libvips
 * en los casos fijados ({@code PaletteExtractorTest}: 192→96 y 150×100→96×64 con ruido). Se lee con ImageIO y
 * {@code getRGB} (sRGB de 8 bits): PNG de 16 bits o en gris podrían diferir de los bytes crudos de sharp.
 */
public final class PaletteExtractor {

  public static final int PALETTE_SIZE = 8;
  public static final String NOT_VARIED = "El sprite no contiene una paleta suficientemente variada.";
  /** Mensaje de sharp ante un formato desconocido. */
  static final String UNSUPPORTED = "Input buffer contains unsupported image format";
  private static final int MAX_SIDE = 96;
  private static final int MIN_ALPHA = 96;
  private static final int MIN_CHANNEL = 20;
  private static final int MAX_CHANNEL = 248;
  private static final int STEP = 24;
  private static final double MIN_DISTANCE = 42;
  private static final int MIN_COLORS = 3;

  /** Colores {@code #rrggbb} en minúsculas y su peso relativo (suman 1). */
  public record Palette(List<String> colors, List<Double> weights) {
    public Palette {
      colors = List.copyOf(colors);
      weights = List.copyOf(weights);
    }
  }

  private record Bucket(int[] rgb, String key, int[] count) {}

  private PaletteExtractor() {}

  public static Palette extract(byte[] image) {
    return extract(image, PALETTE_SIZE);
  }

  public static Palette extract(byte[] image, int size) {
    var decoded = decode(image);
    var width = decoded.getWidth();
    var height = decoded.getHeight();
    var target = fitInside(width, height);
    var buckets = new LinkedHashMap<String, Bucket>();
    for (int y = 0; y < target[1]; y++) {
      int sourceY = sample(y, height, target[1]);
      for (int x = 0; x < target[0]; x++) {
        int argb = decoded.getRGB(sample(x, width, target[0]), sourceY);
        if ((argb >>> 24) < MIN_ALPHA) continue;
        int red = (argb >> 16) & 0xff;
        int green = (argb >> 8) & 0xff;
        int blue = argb & 0xff;
        if (Math.max(red, Math.max(green, blue)) < MIN_CHANNEL || Math.min(red, Math.min(green, blue)) > MAX_CHANNEL) {
          continue;
        }
        var rgb = new int[] {quantize(red), quantize(green), quantize(blue)};
        var key = rgb[0] + ":" + rgb[1] + ":" + rgb[2];
        buckets.computeIfAbsent(key, ignored -> new Bucket(rgb, key, new int[1])).count()[0]++;
      }
    }
    var ranked = new ArrayList<>(buckets.values());
    ranked.sort(Comparator.<Bucket>comparingInt(bucket -> -bucket.count()[0])
        .thenComparing(Bucket::key, Collations.names()));
    var selected = new ArrayList<int[]>();
    for (var candidate : ranked) {
      if (selected.stream().allMatch(color -> distance(color, candidate.rgb()) >= MIN_DISTANCE)) {
        selected.add(candidate.rgb());
      }
      if (selected.size() >= size) break;
    }
    if (selected.size() < MIN_COLORS) throw new IllegalStateException(NOT_VARIED);
    var totals = new long[selected.size()];
    for (var bucket : ranked) {
      int closest = 0;
      for (int index = 1; index < selected.size(); index++) {
        if (distance(bucket.rgb(), selected.get(index)) < distance(bucket.rgb(), selected.get(closest))) closest = index;
      }
      totals[closest] += bucket.count()[0];
    }
    long total = 0;
    for (var count : totals) total += count;
    var colors = new ArrayList<String>();
    var weights = new ArrayList<Double>();
    for (int index = 0; index < selected.size(); index++) {
      var color = selected.get(index);
      colors.add(String.format(Locale.ROOT, "#%02x%02x%02x", color[0], color[1], color[2]));
      weights.add((double) totals[index] / total);
    }
    return new Palette(colors, weights);
  }

  private static BufferedImage decode(byte[] image) {
    try {
      var decoded = ImageIO.read(new ByteArrayInputStream(image));
      if (decoded == null) throw new IllegalArgumentException(UNSUPPORTED);
      return decoded;
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Tamaño de destino de {@code fit: inside} con {@code withoutEnlargement}: el lado que más sobra queda en 96. */
  static int[] fitInside(int width, int height) {
    if (width <= MAX_SIDE && height <= MAX_SIDE) return new int[] {width, height};
    double xFactor = (double) width / MAX_SIDE;
    double yFactor = (double) height / MAX_SIDE;
    if (xFactor >= yFactor) return new int[] {MAX_SIDE, Math.max(1, (int) Math.round(height / xFactor))};
    return new int[] {Math.max(1, (int) Math.round(width / yFactor)), MAX_SIDE};
  }

  /** Vecino más próximo por el centro de la celda de destino. */
  private static int sample(int target, int source, int targetSize) {
    if (source == targetSize) return target;
    return Math.min(source - 1, (int) Math.floor((target + 0.5) * source / targetSize));
  }

  private static int quantize(int channel) {
    return Math.min(255, (int) Math.round(channel / (double) STEP) * STEP);
  }

  private static double distance(int[] left, int[] right) {
    double red = left[0] - right[0];
    double green = left[1] - right[1];
    double blue = left[2] - right[2];
    return Math.sqrt(red * red + green * green + blue * blue);
  }
}

package es.pokemonuniverse.domain.game.assets;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Optional;

/**
 * Port literal de {@code alphaBounds}, {@code localAlphaDensity} y {@code validFocusPoint} de
 * {@code packages/shared/src/games/zoomed-pokemon/rules.ts}: el punto de foco de una ronda debe coincidir con el TS.
 */
public final class FocusPoints {

  /** {@code ZOOMED_POKEMON_ALPHA_THRESHOLD}: un píxel cuenta como visible con alfa estrictamente mayor. */
  public static final int ALPHA_THRESHOLD = 24;
  /** {@code ZOOMED_POKEMON_MIN_LOCAL_DENSITY}. */
  public static final double MIN_LOCAL_DENSITY = 0.32;

  public record Bounds(int x, int y, int width, int height) {}

  /** Coordenadas normalizadas a [0, 1] respecto al plano. */
  public record FocusPoint(double x, double y) {}

  private record Candidate(int x, int y, double density) {}

  private FocusPoints() {}

  public static Optional<Bounds> alphaBounds(AlphaPlane plane, int threshold) {
    int minX = plane.width();
    int minY = plane.height();
    int maxX = -1;
    int maxY = -1;
    for (int y = 0; y < plane.height(); y++) {
      for (int x = 0; x < plane.width(); x++) {
        if (plane.at(x, y) <= threshold) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return maxX < 0 ? Optional.empty() : Optional.of(new Bounds(minX, minY, maxX - minX + 1, maxY - minY + 1));
  }

  public static Optional<Bounds> alphaBounds(AlphaPlane plane) {
    return alphaBounds(plane, ALPHA_THRESHOLD);
  }

  public static double localAlphaDensity(AlphaPlane plane, int x, int y, int radius, int threshold) {
    int useful = 0;
    int total = 0;
    for (int yy = Math.max(0, y - radius); yy <= Math.min(plane.height() - 1, y + radius); yy++) {
      for (int xx = Math.max(0, x - radius); xx <= Math.min(plane.width() - 1, x + radius); xx++) {
        total++;
        if (plane.at(xx, yy) > threshold) useful++;
      }
    }
    return total > 0 ? (double) useful / total : 0;
  }

  /** Elige entre píxeles opacos densos; la semilla la fija la ronda autoritativa. Vacío si no hay píxeles visibles. */
  public static Optional<FocusPoint> validFocusPoint(AlphaPlane plane, long seed) {
    var found = alphaBounds(plane);
    if (found.isEmpty()) return Optional.empty();
    var bounds = found.get();
    // Math.round de JS y de Java redondean igual (mitades hacia +∞).
    int radius = (int) Math.max(2, Math.round(Math.min(bounds.width(), bounds.height()) * 0.08));
    var candidates = new ArrayList<Candidate>();
    int stride = Math.max(1, Math.floorDiv(Math.min(plane.width(), plane.height()), 64));
    for (int y = bounds.y(); y < bounds.y() + bounds.height(); y += stride) {
      for (int x = bounds.x(); x < bounds.x() + bounds.width(); x += stride) {
        if (plane.at(x, y) <= ALPHA_THRESHOLD) continue;
        double density = localAlphaDensity(plane, x, y, radius, ALPHA_THRESHOLD);
        if (density >= MIN_LOCAL_DENSITY) candidates.add(new Candidate(x, y, density));
      }
    }
    if (candidates.isEmpty()) {
      return Optional.of(new FocusPoint((bounds.x() + bounds.width() / 2.0) / plane.width(),
          (bounds.y() + bounds.height() / 2.0) / plane.height()));
    }
    // Orden estable como Array.prototype.sort: densidad descendente, luego y, luego x.
    candidates.sort(Comparator.comparingDouble(Candidate::density).reversed()
        .thenComparingInt(Candidate::y).thenComparingInt(Candidate::x));
    int good = Math.max(1, (int) Math.ceil(candidates.size() * 0.7));
    // |trunc(seed)| mod n sin desbordar en Long.MIN_VALUE.
    int index = (int) Math.abs(seed % good);
    var chosen = candidates.get(index);
    return Optional.of(new FocusPoint((chosen.x() + 0.5) / plane.width(), (chosen.y() + 0.5) / plane.height()));
  }
}

package es.pokemonuniverse.domain.game.assets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Valores fijados ejecutando {@code validFocusPoint} de {@code packages/shared/dist/games/zoomed-pokemon/rules.js} con
 * {@code npx tsx} sobre los mismos planos sintéticos (ver el informe de la Tarea 3 de la etapa 2B).
 */
class FocusPointsTest {

  /** Plano 64×64 con un cuadrado opaco de 16×16 en (8, 8). */
  private static AlphaPlane square() {
    var alpha = new byte[64 * 64];
    for (int y = 8; y < 24; y++) for (int x = 8; x < 24; x++) alpha[y * 64 + x] = (byte) 255;
    return new AlphaPlane(64, 64, alpha);
  }

  /** Plano 150×130 (paso 2) con un triángulo de alfa 200: la fila y cubre x ∈ [10, y). */
  private static AlphaPlane triangle() {
    var alpha = new byte[150 * 130];
    for (int y = 10; y < 110; y++) for (int x = 10; x < 10 + (y - 10); x++) alpha[y * 150 + x] = (byte) 200;
    return new AlphaPlane(150, 130, alpha);
  }

  @Test
  void boundsOfOpaqueSquare() {
    assertEquals(new FocusPoints.Bounds(8, 8, 16, 16), FocusPoints.alphaBounds(square(), 24).orElseThrow());
  }

  @Test
  void focusMatchesTypeScriptOnSquare() {
    var first = FocusPoints.validFocusPoint(square(), 0).orElseThrow();
    var other = FocusPoints.validFocusPoint(square(), 7).orElseThrow();
    assertEquals(new FocusPoints.FocusPoint(0.1640625, 0.1640625), first);
    assertEquals(new FocusPoints.FocusPoint(0.2734375, 0.1640625), other);
    for (var point : List.of(first, other)) {
      assertTrue(point.x() * 64 >= 8 && point.x() * 64 < 24);
      assertTrue(point.y() * 64 >= 8 && point.y() * 64 < 24);
    }
  }

  @Test
  void focusMatchesTypeScriptOnTriangle() {
    var plane = triangle();
    assertEquals(new FocusPoints.FocusPoint(0.12333333333333334, 0.27307692307692305),
        FocusPoints.validFocusPoint(plane, 0).orElseThrow());
    assertEquals(new FocusPoints.FocusPoint(0.12333333333333334, 0.3038461538461538),
        FocusPoints.validFocusPoint(plane, 3).orElseThrow());
    assertEquals(new FocusPoints.FocusPoint(0.19, 0.39615384615384613),
        FocusPoints.validFocusPoint(plane, 41).orElseThrow());
    assertEquals(new FocusPoints.FocusPoint(0.19, 0.39615384615384613),
        FocusPoints.validFocusPoint(plane, -41).orElseThrow());
    assertEquals(new FocusPoints.FocusPoint(0.20333333333333334, 0.5653846153846154),
        FocusPoints.validFocusPoint(plane, 1_000_000).orElseThrow());
    assertEquals(1.0, FocusPoints.localAlphaDensity(plane, 50, 100, 8, 24));
  }

  @Test
  void emptyPlaneHasNoFocus() {
    var empty = new AlphaPlane(32, 32, new byte[32 * 32]);
    assertTrue(FocusPoints.alphaBounds(empty, 24).isEmpty());
    assertTrue(FocusPoints.validFocusPoint(empty, 0).isEmpty());
  }

  @Test
  void sparsePixelsFallBackToBoundsCentre() {
    // Dos píxeles aislados: ninguna vecindad alcanza la densidad 0.32, así que el foco es el centro de la caja.
    var alpha = new byte[100 * 100];
    alpha[10 * 100 + 10] = (byte) 255;
    alpha[90 * 100 + 90] = (byte) 255;
    var point = FocusPoints.validFocusPoint(new AlphaPlane(100, 100, alpha), 5).orElseThrow();
    assertEquals(new FocusPoints.FocusPoint(0.505, 0.505), point);
  }
}

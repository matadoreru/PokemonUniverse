package es.pokemonuniverse.domain.json;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class JsNumbersTest {

  @Test
  void formatsLikeNumberToString() {
    assertEquals("0.1", JsNumbers.format(0.1));
    assertEquals("1", JsNumbers.format(1));
    assertEquals("1.5", JsNumbers.format(1.5));
    assertEquals("2", JsNumbers.format(2.0));
    assertEquals("0", JsNumbers.format(-0.0));
    assertEquals("-3.25", JsNumbers.format(-3.25));
    assertEquals("1000", JsNumbers.format(1000.0));
    assertEquals("100000000000000000000", JsNumbers.format(1e20));
    assertEquals("1e+21", JsNumbers.format(1e21));
    assertEquals("0.000001", JsNumbers.format(1e-6));
    assertEquals("1.5e-7", JsNumbers.format(1.5e-7));
    assertEquals("NaN", JsNumbers.format(Double.NaN));
    assertEquals("-Infinity", JsNumbers.format(Double.NEGATIVE_INFINITY));
  }

  @Test
  void checksSafeIntegersLikeNumberIsSafeInteger() {
    assertTrue(JsNumbers.isSafeInteger(0));
    assertTrue(JsNumbers.isSafeInteger(-0.0));
    assertTrue(JsNumbers.isSafeInteger(3.0));
    assertTrue(JsNumbers.isSafeInteger(9_007_199_254_740_991d));
    assertTrue(JsNumbers.isSafeInteger(-9_007_199_254_740_991d));
    assertFalse(JsNumbers.isSafeInteger(9_007_199_254_740_992d));
    assertFalse(JsNumbers.isSafeInteger(1e20));
    assertFalse(JsNumbers.isSafeInteger(1.5));
    assertFalse(JsNumbers.isSafeInteger(Double.NaN));
    assertFalse(JsNumbers.isSafeInteger(Double.POSITIVE_INFINITY));
  }
}

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

  /** Valores obtenidos de {@code Number(x)} en Node 22. */
  @Test
  void parsesStringsLikeNumberConstructor() {
    assertEquals(0, JsNumbers.fromString(""));
    assertEquals(0, JsNumbers.fromString(" \t\n"));
    assertEquals(12, JsNumbers.fromString(" 12 "));
    assertEquals(7, JsNumbers.fromString(" \u00a0 7 \ufeff"));
    assertEquals(16, JsNumbers.fromString("0x10"));
    assertEquals(16, JsNumbers.fromString("0X10"));
    assertEquals(3, JsNumbers.fromString("0b11"));
    assertEquals(7, JsNumbers.fromString("0o7"));
    assertEquals(1000, JsNumbers.fromString("1e3"));
    assertEquals(5, JsNumbers.fromString("5."));
    assertEquals(0.5, JsNumbers.fromString(".5"));
    assertEquals(5, JsNumbers.fromString("+5"));
    assertEquals(-1.5, JsNumbers.fromString("-1.5"));
    assertEquals(12, JsNumbers.fromString("00012"));
    assertEquals(1e-7, JsNumbers.fromString("1e-7"));
    assertEquals(Double.POSITIVE_INFINITY, JsNumbers.fromString("Infinity"));
    assertEquals(Double.POSITIVE_INFINITY, JsNumbers.fromString("+Infinity"));
    assertEquals(Double.NEGATIVE_INFINITY, JsNumbers.fromString("-Infinity"));
    assertEquals(Double.NEGATIVE_INFINITY, JsNumbers.fromString("-1e400"));
    assertEquals(1.8446744073709552e19, JsNumbers.fromString("0xffffffffffffffff"));
    assertEquals("-0", Double.toString(JsNumbers.fromString("-0")).replace(".0", ""));
    for (var nan : new String[] {"abc", "-0x10", "1_000", "1n", "1d", "1f", "0x1p3", "0x", "e5", ".", "+", "1e",
        "infinity", "NaN", "1 2", "0b2", "0o8", "--1"}) {
      assertTrue(Double.isNaN(JsNumbers.fromString(nan)), nan);
    }
  }

  @Test
  void truthyIsBooleanOfAJsInteger() {
    assertFalse(JsNumbers.truthy(null));
    assertFalse(JsNumbers.truthy(0));
    assertTrue(JsNumbers.truthy(-1));
    assertTrue(JsNumbers.truthy(2));
  }
}

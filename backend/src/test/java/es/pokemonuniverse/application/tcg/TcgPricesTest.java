package es.pokemonuniverse.application.tcg;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

/** {@code canonicalTcgPrice} y {@code compareTcgPrices} de {@code tcg-higher-lower/config.ts}. */
class TcgPricesTest {

  @Test
  void canonicalStripsLeadingIntegerZerosAndTrailingFractionZeros() {
    assertEquals("1.1", TcgPrices.canonical("01.10"));
    assertEquals("0", TcgPrices.canonical("000"));
    assertEquals("0", TcgPrices.canonical("0.0000"));
    assertEquals("12.5", TcgPrices.canonical("12.5000"));
    assertEquals("100", TcgPrices.canonical("100"));
    assertEquals("0.05", TcgPrices.canonical("0.05"));
  }

  @Test
  void canonicalRejectsAnythingButAsciiNonNegativeDecimals() {
    for (var value : new String[] {"", "-1", "1.", ".5", "1e3", "NaN", " 1", "1,5", "١"}) {
      assertNull(TcgPrices.canonical(value), value);
    }
  }

  @Test
  void compareIsDecimalWithoutFloats() {
    assertEquals(0, TcgPrices.compare("1.10", "1.1"));
    assertEquals(-1, TcgPrices.compare("1.09", "1.1"));
    assertEquals(1, TcgPrices.compare("10", "9.999"));
    assertEquals(1, TcgPrices.compare("0.30000000000000000001", "0.3"));
    assertEquals(0, TcgPrices.compare("007", "7.000"));
    assertEquals("Invalid canonical TCG price",
        assertThrows(IllegalArgumentException.class, () -> TcgPrices.compare("1", "-1")).getMessage());
  }
}

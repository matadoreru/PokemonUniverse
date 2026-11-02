package es.pokemonuniverse.domain.json;

import java.math.BigDecimal;
import java.math.BigInteger;

/**
 * Formatea números como {@code Number.prototype.toString()} de JavaScript ({@code 2}, no {@code 2.0}) y reproduce
 * {@code Number.isSafeInteger}, que es lo que comprueba {@code .int()} de Zod 4.
 */
public final class JsNumbers {

  private static final BigDecimal PLAIN_MIN = new BigDecimal("1e-6");
  private static final BigDecimal PLAIN_LIMIT = new BigDecimal("1e21");

  /** {@code Number.MAX_SAFE_INTEGER}: {@code 2^53 - 1}. */
  public static final double MAX_SAFE_INTEGER = 9_007_199_254_740_991d;

  private JsNumbers() {}

  /** {@code Number.isSafeInteger}: finito, sin parte decimal y con {@code |value| <= 2^53 - 1}. */
  public static boolean isSafeInteger(double value) {
    return !Double.isNaN(value) && !Double.isInfinite(value) && value == Math.rint(value)
        && Math.abs(value) <= MAX_SAFE_INTEGER;
  }

  /** Enteros tal cual; el resto como {@link #format(double)}. */
  public static String format(Number value) {
    if (value instanceof Integer || value instanceof Long || value instanceof Short || value instanceof Byte
        || value instanceof BigInteger) {
      return value.toString();
    }
    return format(value.doubleValue());
  }

  /**
   * Notación decimal para magnitudes en [1e-6, 1e21) y exponencial ({@code 1e+21}, {@code 1.5e-7}) fuera de ese rango.
   * {@link Double#toString} da la representación más corta que identifica al {@code double}, igual que JavaScript.
   */
  public static String format(double value) {
    if (Double.isNaN(value)) return "NaN";
    if (Double.isInfinite(value)) return value > 0 ? "Infinity" : "-Infinity";
    if (value == 0) return "0";
    var decimal = new BigDecimal(Double.toString(value)).stripTrailingZeros();
    var magnitude = decimal.abs();
    if (magnitude.compareTo(PLAIN_MIN) >= 0 && magnitude.compareTo(PLAIN_LIMIT) < 0) return decimal.toPlainString();
    var digits = decimal.unscaledValue().abs().toString();
    int exponent = digits.length() - 1 - decimal.scale();
    var mantissa = digits.length() == 1 ? digits : digits.charAt(0) + "." + digits.substring(1);
    return (value < 0 ? "-" : "") + mantissa + "e" + (exponent >= 0 ? "+" : "-") + Math.abs(exponent);
  }
}

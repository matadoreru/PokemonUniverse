package es.pokemonuniverse.domain.json;

import java.math.BigDecimal;
import java.math.BigInteger;

/** Formatea números como {@code Number.prototype.toString()} de JavaScript ({@code 2}, no {@code 2.0}). */
public final class JsNumbers {

  private static final BigDecimal PLAIN_MIN = new BigDecimal("1e-6");
  private static final BigDecimal PLAIN_LIMIT = new BigDecimal("1e21");

  private JsNumbers() {}

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

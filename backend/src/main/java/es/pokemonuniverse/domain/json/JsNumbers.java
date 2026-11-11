package es.pokemonuniverse.domain.json;

import io.micronaut.core.annotation.Nullable;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.regex.Pattern;

/**
 * Formatea números como {@code Number.prototype.toString()} de JavaScript ({@code 2}, no {@code 2.0}) y reproduce
 * {@code Number.isSafeInteger}, que es lo que comprueba {@code .int()} de Zod 4.
 */
public final class JsNumbers {

  private static final BigDecimal PLAIN_MIN = new BigDecimal("1e-6");
  private static final BigDecimal PLAIN_LIMIT = new BigDecimal("1e21");
  /** {@code StrDecimalLiteral} de ECMAScript (sin {@code Infinity}, que se trata aparte). */
  private static final Pattern DECIMAL = Pattern.compile("[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?");
  private static final Pattern HEX = Pattern.compile("0[xX][0-9a-fA-F]+");
  private static final Pattern OCTAL = Pattern.compile("0[oO][0-7]+");
  private static final Pattern BINARY = Pattern.compile("0[bB][01]+");

  /** {@code Number.MAX_SAFE_INTEGER}: {@code 2^53 - 1}. */
  public static final double MAX_SAFE_INTEGER = 9_007_199_254_740_991d;

  private JsNumbers() {}

  /** {@code Boolean(value)} de un entero de JS: ni {@code null} ni {@code 0}. */
  public static boolean truthy(@Nullable Integer value) {
    return value != null && value != 0;
  }

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

  /**
   * {@code Number(text)} de JavaScript (lo que hace {@code z.coerce.number()} con una cadena): recorta los espacios de
   * ECMAScript, la cadena vacía es {@code 0}, admite {@code 0x}/{@code 0o}/{@code 0b} sin signo, {@code Infinity} con
   * signo opcional y literales decimales; cualquier otra cosa es {@code NaN} (también los sufijos {@code d}/{@code f}
   * y los hexadecimales con exponente que {@link Double#parseDouble} sí acepta).
   */
  public static double fromString(String text) {
    var trimmed = es.pokemonuniverse.domain.game.engine.infra.JsStrings.trim(text);
    if (trimmed.isEmpty()) return 0;
    switch (trimmed) {
      case "Infinity", "+Infinity" -> {
        return Double.POSITIVE_INFINITY;
      }
      case "-Infinity" -> {
        return Double.NEGATIVE_INFINITY;
      }
      default -> {}
    }
    if (DECIMAL.matcher(trimmed).matches()) return Double.parseDouble(trimmed);
    if (HEX.matcher(trimmed).matches()) return new BigInteger(trimmed.substring(2), 16).doubleValue();
    if (OCTAL.matcher(trimmed).matches()) return new BigInteger(trimmed.substring(2), 8).doubleValue();
    if (BINARY.matcher(trimmed).matches()) return new BigInteger(trimmed.substring(2), 2).doubleValue();
    return Double.NaN;
  }
}

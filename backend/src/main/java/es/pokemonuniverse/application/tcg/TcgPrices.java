package es.pokemonuniverse.application.tcg;

import io.micronaut.core.annotation.Nullable;
import java.util.regex.Pattern;

/**
 * Precios TCG como decimales en texto ({@code canonicalTcgPrice} y {@code compareTcgPrices} de
 * {@code tcg-higher-lower/config.ts}): nunca pasan por coma flotante.
 */
public final class TcgPrices {

  /** {@code /^\d+(?:\.\d+)?$/}: {@code \d} es ASCII en JS (sin bandera {@code u}) y en Java. */
  private static final Pattern DECIMAL = Pattern.compile("\\d+(?:\\.\\d+)?");

  private TcgPrices() {}

  /** Sin ceros iniciales en la parte entera ni finales en la decimal; {@code null} si no es un decimal no negativo. */
  public static @Nullable String canonical(String value) {
    if (!DECIMAL.matcher(value).matches()) return null;
    int dot = value.indexOf('.');
    var integer = dot < 0 ? value : value.substring(0, dot);
    var fraction = dot < 0 ? "" : value.substring(dot + 1);
    int start = 0;
    while (start < integer.length() - 1 && integer.charAt(start) == '0') start++;
    int end = fraction.length();
    while (end > 0 && fraction.charAt(end - 1) == '0') end--;
    var normalizedInteger = integer.substring(start);
    var normalizedFraction = fraction.substring(0, end);
    return normalizedFraction.isEmpty() ? normalizedInteger : normalizedInteger + "." + normalizedFraction;
  }

  /**
   * Compara por longitud de la parte entera, después la parte entera y por último las fracciones rellenadas con ceros
   * al mismo ancho. Devuelve -1, 0 o 1; un precio no canónico lanza {@code Invalid canonical TCG price}.
   */
  public static int compare(String left, String right) {
    var a = canonical(left);
    var b = canonical(right);
    if (a == null || b == null) throw new IllegalArgumentException("Invalid canonical TCG price");
    var ai = integerPart(a);
    var bi = integerPart(b);
    if (ai.length() != bi.length()) return ai.length() > bi.length() ? 1 : -1;
    int byInteger = ai.compareTo(bi);
    if (byInteger != 0) return byInteger > 0 ? 1 : -1;
    var af = fractionPart(a);
    var bf = fractionPart(b);
    int width = Math.max(af.length(), bf.length());
    int byFraction = pad(af, width).compareTo(pad(bf, width));
    return Integer.signum(byFraction);
  }

  private static String integerPart(String canonical) {
    int dot = canonical.indexOf('.');
    return dot < 0 ? canonical : canonical.substring(0, dot);
  }

  private static String fractionPart(String canonical) {
    int dot = canonical.indexOf('.');
    return dot < 0 ? "" : canonical.substring(dot + 1);
  }

  private static String pad(String fraction, int width) {
    return fraction + "0".repeat(width - fraction.length());
  }
}

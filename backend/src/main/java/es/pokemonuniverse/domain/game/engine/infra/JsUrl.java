package es.pokemonuniverse.domain.game.engine.infra;

import java.nio.charset.StandardCharsets;

/**
 * {@code encodeURIComponent} de JavaScript, para las rutas de imágenes y audio de ronda que van en las proyecciones.
 * {@link java.net.URLEncoder} no es equivalente: codifica el espacio como {@code +} y no deja intactos
 * {@code ! ' ( ) * ~}.
 */
public final class JsUrl {

  private static final char[] HEX = "0123456789ABCDEF".toCharArray();

  private JsUrl() {}

  /**
   * Deja intactos los caracteres no reservados de ECMAScript ({@code A-Z a-z 0-9 - _ . ! ~ * ' ( )}) y codifica el
   * resto como los bytes UTF-8 de su punto de código en {@code %XX} con hexadecimal en mayúscula. Un surrogate suelto
   * lanza {@link IllegalArgumentException}, como el {@code URIError} de JS.
   */
  public static String encodeURIComponent(String value) {
    var result = new StringBuilder(value.length());
    int index = 0;
    while (index < value.length()) {
      int codePoint = value.codePointAt(index);
      index += Character.charCount(codePoint);
      if (codePoint < 0x80 && isUnreserved((char) codePoint)) {
        result.append((char) codePoint);
        continue;
      }
      if (codePoint <= 0xFFFF && Character.isSurrogate((char) codePoint)) {
        throw new IllegalArgumentException("URI malformed");
      }
      for (byte b : new String(Character.toChars(codePoint)).getBytes(StandardCharsets.UTF_8)) {
        result.append('%').append(HEX[(b >> 4) & 0xF]).append(HEX[b & 0xF]);
      }
    }
    return result.toString();
  }

  private static boolean isUnreserved(char c) {
    return c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9'
        || "-_.!~*'()".indexOf(c) >= 0;
  }
}

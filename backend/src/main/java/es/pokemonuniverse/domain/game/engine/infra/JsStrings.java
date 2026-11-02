package es.pokemonuniverse.domain.game.engine.infra;

/**
 * Operaciones de texto con la semántica de JavaScript, para los motores que reciben texto libre de los jugadores.
 *
 * <p>{@link String#trim()} solo quita caracteres {@code <= U+0020} y {@link String#strip()} usa
 * {@link Character#isWhitespace}, que excluye los espacios de no separación ({@code U+00A0}, {@code U+2007},
 * {@code U+202F}) y {@code U+FEFF}. {@code String.prototype.trim} (y el {@code .trim()} de Zod) quita
 * {@code WhiteSpace} y {@code LineTerminator} de ECMAScript: TAB, VT, FF, SP, {@code U+00A0}, {@code U+FEFF}, la
 * categoría {@code Zs} completa, LF, CR, {@code U+2028} y {@code U+2029}.
 */
public final class JsStrings {

  private JsStrings() {}

  /** {@code value.trim()} de JavaScript. */
  public static String trim(String value) {
    int start = 0;
    int end = value.length();
    while (start < end && isJsWhitespace(value.charAt(start))) start++;
    while (end > start && isJsWhitespace(value.charAt(end - 1))) end--;
    return value.substring(start, end);
  }

  /** {@code WhiteSpace} o {@code LineTerminator} de ECMAScript (todos en el plano básico: basta con {@code char}). */
  public static boolean isJsWhitespace(char c) {
    return switch (c) {
      case '\t', '\n', '\u000B', '\f', '\r', ' ', '\u00A0', '\u2028', '\u2029', '\uFEFF' -> true;
      default -> Character.getType(c) == Character.SPACE_SEPARATOR;
    };
  }
}

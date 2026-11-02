package es.pokemonuniverse.application.datasync.tcg;

import java.net.URI;
import java.nio.charset.StandardCharsets;

/**
 * Direcciones de TCGdex. Node usa {@code https://api.tcgdex.net/v2/en} fijo; aquí la base es configurable
 * ({@code pu.data-sync.tcgdex-base-url}) para que las pruebas sirvan las respuestas grabadas.
 */
public record TcgDexUrls(String base) {

  public static final String DEFAULT_BASE = "https://api.tcgdex.net/v2/en";
  private static final String UNRESERVED = "-_.!~*'()";

  public TcgDexUrls {
    base = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
  }

  public URI sets() {
    return URI.create(base + "/sets");
  }

  public URI set(String id) {
    return URI.create(base + "/sets/" + encodeUriComponent(id));
  }

  public URI card(String id) {
    return URI.create(base + "/cards/" + encodeUriComponent(id));
  }

  /**
   * {@code encodeURIComponent}: deja letras y dígitos ASCII y {@code -_.!~*'()}; el resto va en UTF-8 con
   * {@code %XX} en mayúsculas (a diferencia de {@code URLEncoder}, el espacio es {@code %20}, no {@code +}).
   */
  public static String encodeUriComponent(String value) {
    var out = new StringBuilder();
    for (byte b : value.getBytes(StandardCharsets.UTF_8)) {
      int c = b & 0xff;
      if (c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || UNRESERVED.indexOf(c) >= 0) {
        out.append((char) c);
      } else {
        out.append('%').append(Character.toUpperCase(Character.forDigit(c >> 4, 16)))
            .append(Character.toUpperCase(Character.forDigit(c & 0xf, 16)));
      }
    }
    return out.toString();
  }
}

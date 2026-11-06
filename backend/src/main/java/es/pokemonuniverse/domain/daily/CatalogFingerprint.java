package es.pokemonuniverse.domain.daily;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

/** Huella del catálogo fijado de un día: SHA-256 hexadecimal en minúsculas de los ids en orden, unidos por {@code \n}. */
public final class CatalogFingerprint {

  private CatalogFingerprint() {}

  public static String of(List<String> orderedIds) {
    try {
      var digest = MessageDigest.getInstance("SHA-256")
          .digest(String.join("\n", orderedIds).getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 no disponible", e);
    }
  }
}

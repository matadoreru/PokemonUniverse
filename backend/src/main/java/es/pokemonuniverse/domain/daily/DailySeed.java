package es.pokemonuniverse.domain.daily;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.LocalDate;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Semilla secreta del día: los 4 primeros bytes (big-endian, sin signo) de
 * {@code HMAC-SHA256(key, "daily|" + AAAA-MM-DD)}. Sin la clave del servidor no se puede calcular el reto de antemano.
 * Primero sortea el juego ({@code seed % 4}) y después alimenta el {@code Mulberry32} de la partida.
 */
public final class DailySeed {

  private static final String ALGORITHM = "HmacSHA256";

  private DailySeed() {}

  /** Semilla en {@code [0, 2^32)}; {@code LocalDate#toString} ya es {@code AAAA-MM-DD}. */
  public static long seed(byte[] key, LocalDate date) {
    try {
      var mac = Mac.getInstance(ALGORITHM);
      mac.init(new SecretKeySpec(key, ALGORITHM));
      var digest = mac.doFinal(("daily|" + date).getBytes(StandardCharsets.UTF_8));
      return Integer.toUnsignedLong(ByteBuffer.wrap(digest).getInt());
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("HMAC-SHA256 no disponible", e);
    }
  }
}

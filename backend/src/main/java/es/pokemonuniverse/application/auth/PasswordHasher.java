package es.pokemonuniverse.application.auth;

import at.favre.lib.crypto.bcrypt.BCrypt;
import at.favre.lib.crypto.bcrypt.LongPasswordStrategies;
import jakarta.inject.Singleton;

/** Las contraseñas largas se truncan como en bcryptjs (solo cuentan los primeros 72 bytes). bcrypt coste 12 con prefijo {@code $2b$}, compatible con los hashes de bcryptjs del servidor Node. */
@Singleton
public class PasswordHasher {

  private static final int COST = 12;
  /**
   * Hash bcrypt fijo (coste 12, de una cadena aleatoria desechada) contra el que se verifica cuando la cuenta no existe,
   * para que el login cueste lo mismo con un usuario desconocido que con una contraseña errónea.
   */
  public static final String DUMMY_HASH = "$2b$12$kXZEq.cM4ggjsbDDTv0dPeGKriU1bSfYERizeta.YGFHYJ/TTfux2";
  private static final BCrypt.Version VERSION = BCrypt.Version.VERSION_2B;
  private static final BCrypt.Hasher HASHER =
      BCrypt.with(VERSION, new java.security.SecureRandom(), LongPasswordStrategies.truncate(VERSION));
  private static final BCrypt.Verifyer VERIFYER =
      BCrypt.verifyer(VERSION, LongPasswordStrategies.truncate(VERSION));

  public String hash(String raw) {
    return HASHER.hashToString(COST, raw.toCharArray());
  }

  public boolean matches(String raw, String hash) {
    try {
      return VERIFYER.verify(raw.toCharArray(), hash).verified;
    } catch (IllegalArgumentException e) {
      return false;
    }
  }
}

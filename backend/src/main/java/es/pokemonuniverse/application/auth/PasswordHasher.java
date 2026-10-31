package es.pokemonuniverse.application.auth;

import at.favre.lib.crypto.bcrypt.BCrypt;
import jakarta.inject.Singleton;

/** bcrypt coste 12 con prefijo {@code $2b$}, compatible con los hashes de bcryptjs del servidor Node. */
@Singleton
public class PasswordHasher {

  private static final int COST = 12;

  public String hash(String raw) {
    return BCrypt.with(BCrypt.Version.VERSION_2B).hashToString(COST, raw.toCharArray());
  }

  public boolean matches(String raw, String hash) {
    try {
      return BCrypt.verifyer().verify(raw.toCharArray(), hash).verified;
    } catch (IllegalArgumentException e) {
      return false;
    }
  }
}

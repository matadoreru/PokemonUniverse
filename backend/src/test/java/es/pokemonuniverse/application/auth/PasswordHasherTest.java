package es.pokemonuniverse.application.auth;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PasswordHasherTest {

  /** Producido por bcryptjs 3: bcryptjs.hashSync('0123456789', 12). */
  private static final String NODE_HASH = "$2b$12$le2h.G5BPwDdUFBQ4OErJ.fFh5xZVyUPRKQHbFicJe/JYuneJIWmS";

  private final PasswordHasher hasher = new PasswordHasher();

  @Test
  void verifiesBcryptJsHash() {
    assertTrue(hasher.matches("0123456789", NODE_HASH));
    assertFalse(hasher.matches("0123456780", NODE_HASH));
  }

  @Test
  void hashesWithCost12AndPrefix2b() {
    var hash = hasher.hash("0123456789");
    assertTrue(hash.startsWith("$2b$12$"), hash);
    assertTrue(hasher.matches("0123456789", hash));
  }

  @Test
  void malformedHashDoesNotMatch() {
    assertFalse(hasher.matches("x", "not-a-hash"));
  }
}

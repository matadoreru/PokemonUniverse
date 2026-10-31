package es.pokemonuniverse.application.auth;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PasswordHasherTest {

  /** Producido por bcryptjs 3: bcryptjs.hashSync('0123456789', 12). */
  private static final String NODE_HASH = "$2b$12$le2h.G5BPwDdUFBQ4OErJ.fFh5xZVyUPRKQHbFicJe/JYuneJIWmS";

  // node -e "import('bcryptjs').then(b=>console.log(b.default.hashSync('abcdefghij'.repeat(8),12)))"
  private static final String ASCII_80 = "abcdefghij".repeat(8);
  private static final String ASCII_80_HASH = "$2b$12$qNcNN/fybi3gPf8ZFurWlOYaoqKnP5graLiBwImecbLbCNemjVwYi";
  // node -e "import('bcryptjs').then(b=>console.log(b.default.hashSync('ñ'.repeat(40),12)))"
  private static final String N_TILDE_40 = "ñ".repeat(40);
  private static final String N_TILDE_40_HASH = "$2b$12$4Q1aP1yEOuG8i3hd5Qz3YuHjXJV6MNgHqMhy59oFoGVp58BIZdZ2a";

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

  @Test
  void verifiesLongAsciiBcryptJsHash() {
    assertTrue(hasher.matches(ASCII_80, ASCII_80_HASH));
  }

  @Test
  void verifiesMultibyteBcryptJsHash() {
    assertTrue(hasher.matches(N_TILDE_40, N_TILDE_40_HASH));
  }

  /** bcryptjs.compareSync: 72 caracteres ASCII ya coinciden, 71 no; lo que sigue al byte 72 se ignora. */
  @Test
  void onlyFirst72BytesCountLikeBcryptJs() {
    assertTrue(hasher.matches(ASCII_80.substring(0, 72) + "ZZZ", ASCII_80_HASH));
    assertTrue(hasher.matches(ASCII_80.substring(0, 72), ASCII_80_HASH));
    assertFalse(hasher.matches(ASCII_80.substring(0, 71), ASCII_80_HASH));
    assertTrue(hasher.matches("ñ".repeat(36) + "x", N_TILDE_40_HASH));
    assertFalse(hasher.matches("ñ".repeat(35) + "a", N_TILDE_40_HASH));
  }

  @Test
  void hashesLongPasswordsWithoutFailing() {
    var hash = hasher.hash("x".repeat(100));
    assertTrue(hasher.matches("x".repeat(100), hash));
  }
}

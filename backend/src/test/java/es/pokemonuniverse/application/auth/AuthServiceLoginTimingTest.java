package es.pokemonuniverse.application.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import at.favre.lib.crypto.bcrypt.BCrypt;
import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.application.errors.UnauthorizedException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * El login con una cuenta desconocida también ejecuta bcrypt (contra un hash fijo), para que no se distinga por tiempo
 * de una contraseña errónea. No se mide el tiempo: se cuenta qué hashes se verifican.
 */
class AuthServiceLoginTimingTest {

  /** Hasher real que apunta cada hash verificado. */
  private static final class RecordingHasher extends PasswordHasher {
    final List<String> verified = new ArrayList<>();

    @Override
    public boolean matches(String raw, String hash) {
      verified.add(hash);
      return super.matches(raw, hash);
    }
  }

  private static final class NoAccounts extends AccountLookup {
    NoAccounts() {
      super(null);
    }

    @Override
    public Optional<UserEntity> find(String identifier) {
      return Optional.empty();
    }
  }

  @Test
  void unknownAccountStillRunsTheHasherAgainstTheDummyHash() {
    var hasher = new RecordingHasher();
    var service = new AuthService(null, null, hasher, null, new NoAccounts());
    var error = assertThrows(UnauthorizedException.class,
        () -> service.login(new LoginCommand("nadie@mail.com", "0123456789")));
    assertEquals("Invalid email or password", error.getMessage());
    assertEquals(List.of(PasswordHasher.DUMMY_HASH), hasher.verified);
  }

  /** Un hash mal formado haría que {@code matches} saliera al instante y no igualaría el coste. */
  @Test
  void dummyHashIsAWellFormedCost12Hash() {
    assertTrue(PasswordHasher.DUMMY_HASH.startsWith("$2b$12$"), PasswordHasher.DUMMY_HASH);
    var result = BCrypt.verifyer(BCrypt.Version.VERSION_2B)
        .verify("0123456789".toCharArray(), PasswordHasher.DUMMY_HASH.toCharArray());
    assertTrue(result.validFormat, result.formatErrorMessage);
    assertEquals(12, result.details.cost);
    assertFalse(result.verified);
    assertFalse(new PasswordHasher().matches("0123456789", PasswordHasher.DUMMY_HASH));
  }
}

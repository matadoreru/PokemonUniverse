package es.pokemonuniverse.fixtures;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.config.PuConfig;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.identity.UserRole;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

/**
 * Genera la fixture inversa que verifica Node en {@code apps/server/src/auth/java-session-fixture.test.ts}.
 *
 * <p>Solo se ejecuta a mano: {@code ./gradlew test -Dpu.exportFixture=true --tests '*ExportJavaSessionFixture*'}.
 * {@code sign} fija exp = now + 7 días, así que {@code now} = 2098-12-25 deja exp en 2099-01-01.
 */
@EnabledIfSystemProperty(named = "pu.exportFixture", matches = "true")
class ExportJavaSessionFixture {

  private static final String SECRET = "test-secret-test-secret-test-secret-1234";
  private static final Path TARGET = Path.of("..", "apps", "server", "src", "auth", "fixtures", "java-session-token.txt");

  @Test
  void exportSessionToken() throws IOException {
    var tokens = new IdentityTokens(new PuConfig(new PuConfig.Auth(SECRET, false), "http://localhost:5173", false, ".data/avatars", ""));
    var user = new AuthUser("user_fixture_java", "Ana", AuthUser.Kind.USER, null, UserRole.USER, new AvatarRef.Default());
    var token = tokens.sign(user, Instant.parse("2098-12-25T00:00:00Z"));
    Files.createDirectories(TARGET.getParent());
    Files.writeString(TARGET, token + "\n");
  }
}

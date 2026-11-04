package es.pokemonuniverse.application.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.identity.UserRole;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import org.junit.jupiter.api.Test;

@MicronautTest(startApplication = false)
class IdentityTokensTest {

  private static final String SECRET = "test-secret-test-secret-test-secret-1234";

  @Inject IdentityTokens tokens;

  private static String fixture() throws IOException {
    try (var in = IdentityTokensTest.class.getResourceAsStream("/fixtures/node-session-token.txt")) {
      return new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
    }
  }

  private static String signRaw(JWTClaimsSet.Builder claims) throws Exception {
    var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims.build());
    jwt.sign(new MACSigner(SECRET.getBytes(StandardCharsets.UTF_8)));
    return jwt.serialize();
  }

  private static JWTClaimsSet.Builder base() {
    return new JWTClaimsSet.Builder()
        .subject("u1")
        .claim("displayName", "Ana")
        .claim("kind", "USER")
        .expirationTime(Date.from(Instant.now().plus(Duration.ofDays(1))));
  }

  @Test
  void verifiesTokenIssuedByNode() throws Exception {
    var user = tokens.verify(fixture());
    assertEquals("user_fixture", user.id());
    assertEquals("Ana", user.displayName());
    assertEquals(AuthUser.Kind.USER, user.kind());
    assertEquals("ana@example.com", user.email());
    assertEquals(UserRole.ADMIN, user.role());
    // El token de Node lleva el avatar predefinido «trainer-aqua»: tras su retirada se lee como la inicial.
    assertEquals(new AvatarRef.Default(), user.avatar());
  }

  @Test
  void roundTripGuestHasThirtyDayExpiry() throws Exception {
    var guest = new AuthUser("g1", "Invitado", AuthUser.Kind.GUEST, null, null, new AvatarRef.Default());
    var now = Instant.parse("2026-01-01T00:00:00Z");
    var jwt = SignedJWT.parse(tokens.sign(guest, now));
    var claims = jwt.getJWTClaimsSet();
    assertEquals(Duration.ofDays(30).toSeconds(),
        claims.getExpirationTime().toInstant().getEpochSecond() - claims.getIssueTime().toInstant().getEpochSecond());
    assertEquals(JWSAlgorithm.HS256, jwt.getHeader().getAlgorithm());
    assertEquals("g1", claims.getSubject());
    assertEquals("Invitado", claims.getStringClaim("displayName"));
    assertEquals("GUEST", claims.getStringClaim("kind"));
    assertEquals(Map.of("type", "DEFAULT"), claims.getJSONObjectClaim("avatar"));
    assertFalse(claims.getClaims().containsKey("email"));
    assertFalse(claims.getClaims().containsKey("role"));
  }

  @Test
  void roundTripUserHasSevenDayExpiryAndClaims() throws Exception {
    var user = new AuthUser("u1", "Ana", AuthUser.Kind.USER, "a@b.c", UserRole.USER,
        new AvatarRef.Custom("0123456789abcdef0123456789abcdef0123.webp", 7));
    var token = tokens.sign(user, Instant.now());
    var claims = SignedJWT.parse(token).getJWTClaimsSet();
    assertEquals(Duration.ofDays(7).toSeconds(),
        claims.getExpirationTime().toInstant().getEpochSecond() - claims.getIssueTime().toInstant().getEpochSecond());
    assertEquals("USER", claims.getStringClaim("role"));
    assertEquals("a@b.c", claims.getStringClaim("email"));
    assertEquals(user, tokens.verify(token));
  }

  @Test
  void invalidAvatarFallsBackToDefault() throws Exception {
    var token = signRaw(base().claim("avatar", Map.of("type", "CUSTOM", "value", "nope", "version", 1)));
    assertEquals(new AvatarRef.Default(), tokens.verify(token).avatar());
  }

  @Test
  void formerPresetAvatarInAnOldCookieFallsBackToDefault() throws Exception {
    var token = signRaw(base().claim("avatar", Map.of("type", "PRESET", "value", "trainer-aqua")));
    assertEquals(new AvatarRef.Default(), tokens.verify(token).avatar());
  }

  @Test
  void missingOrInvalidRoleDefaultsToUserForUsersAndNullForGuests() throws Exception {
    assertEquals(UserRole.USER, tokens.verify(signRaw(base())).role());
    assertEquals(UserRole.USER, tokens.verify(signRaw(base().claim("role", "ROOT"))).role());
    assertNull(tokens.verify(signRaw(base().claim("kind", "GUEST").claim("role", "ADMIN"))).role());
  }

  @Test
  void tamperedSignatureIsRejected() throws Exception {
    assertThrows(InvalidTokenException.class, () -> tokens.verify(fixture() + "x"));
  }

  private static String b64(String json) {
    return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8));
  }

  @Test
  void algorithmConfusionIsRejected() throws Exception {
    var payload = b64("{\"sub\":\"u1\",\"displayName\":\"Ana\",\"kind\":\"USER\",\"exp\":4070908800}");
    assertThrows(InvalidTokenException.class, () -> tokens.verify(b64("{\"alg\":\"none\"}") + "." + payload + "."));
    assertThrows(InvalidTokenException.class,
        () -> tokens.verify(b64("{\"alg\":\"RS256\"}") + "." + payload + "." + b64("sig")));
    var signingInput = b64("{\"alg\":\"HS512\"}") + "." + payload;
    var mac = javax.crypto.Mac.getInstance("HmacSHA512");
    mac.init(new javax.crypto.spec.SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
    var sig = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8)));
    var hs512 = signingInput + "." + sig;
    assertThrows(InvalidTokenException.class, () -> tokens.verify(hs512));
  }

  @Test
  void emptySubjectIsRejected() {
    assertThrows(InvalidTokenException.class, () -> tokens.verify(signRawUnchecked(base().subject(""))));
  }

  private static String signRawUnchecked(JWTClaimsSet.Builder claims) {
    try {
      return signRaw(claims);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  @Test
  void expiredAndMalformedTokensAreRejected() throws Exception {
    var expired = signRaw(base().expirationTime(Date.from(Instant.now().minusSeconds(3600))));
    assertThrows(InvalidTokenException.class, () -> tokens.verify(expired));
    assertThrows(InvalidTokenException.class, () -> tokens.verify("not-a-jwt"));
    assertThrows(InvalidTokenException.class, () -> tokens.verify(signRaw(base().subject(null))));
    assertThrows(InvalidTokenException.class, () -> tokens.verify(signRaw(base().claim("kind", "ROBOT"))));
    assertThrows(InvalidTokenException.class, () -> tokens.verify(signRaw(base().claim("displayName", 3))));
  }
}

package es.pokemonuniverse.application.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import es.pokemonuniverse.config.PuConfig;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.http.cookie.Cookie;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** {@code nbf} del JWT de sesión: como {@code jose} sin tolerancia, un token aún no válido es una sesión inválida. */
@MicronautTest
class IdentityTokensNotBeforeTest {

  @Inject IdentityTokens tokens;
  @Inject PuConfig config;
  @Inject @Client("/") HttpClient client;

  /** Copia las reclamaciones del token emitido por el servidor y le añade {@code nbf}, firmado con el mismo secreto. */
  private String withNotBefore(String token, Instant notBefore) throws Exception {
    var claims = new JWTClaimsSet.Builder(SignedJWT.parse(token).getJWTClaimsSet())
        .notBeforeTime(Date.from(notBefore))
        .build();
    var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
    jwt.sign(new MACSigner(config.auth().secret().getBytes(StandardCharsets.UTF_8)));
    return jwt.serialize();
  }

  private String registeredToken() {
    var u = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    var res = client.toBlocking().exchange(HttpRequest.POST("/api/auth/register",
        Map.of("username", "nbf_" + u, "email", "nbf" + u + "@mail.com", "password", "0123456789")), Map.class);
    return res.getCookie("pu_session").map(Cookie::getValue).orElseThrow();
  }

  private HttpStatus profileStatus(String token) {
    try {
      return client.toBlocking()
          .exchange(HttpRequest.GET("/api/auth/profile").cookie(Cookie.of("pu_session", token)), String.class)
          .getStatus();
    } catch (HttpClientResponseException e) {
      return e.getStatus();
    }
  }

  @Test
  void futureNotBeforeIsRejected() throws Exception {
    var token = withNotBefore(registeredToken(), Instant.now().plus(Duration.ofMinutes(5)));
    var error = assertThrows(InvalidTokenException.class, () -> tokens.verify(token));
    assertEquals("Token not yet valid", error.getMessage());
    assertEquals(HttpStatus.UNAUTHORIZED, profileStatus(token));
  }

  @Test
  void pastNotBeforeIsAccepted() throws Exception {
    var token = withNotBefore(registeredToken(), Instant.now().minus(Duration.ofMinutes(5)));
    tokens.verify(token);
    assertEquals(HttpStatus.OK, profileStatus(token));
  }
}

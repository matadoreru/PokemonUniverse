package es.pokemonuniverse.adapters.in.rest.identity;

import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.context.annotation.Property;
import io.micronaut.http.HttpResponse;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

@MicronautTest(startApplication = false)
@Property(name = "pu.auth.cookie-secure", value = "true")
class SessionCookiesSecureTest {

  @Inject SessionCookies cookies;

  @Test
  void establishAndClearEmitSecureWhenConfigured() {
    var res = HttpResponse.ok();
    cookies.establish(res, "abc");
    assertTrue(res.getHeaders().get("Set-Cookie").contains("Secure"));
    var cleared = HttpResponse.ok();
    cookies.clear(cleared);
    assertTrue(cleared.getHeaders().get("Set-Cookie").contains("Secure"));
  }
}

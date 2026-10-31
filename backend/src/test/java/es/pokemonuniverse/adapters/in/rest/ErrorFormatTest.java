package es.pokemonuniverse.adapters.in.rest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

@MicronautTest
class ErrorFormatTest {

  @Inject
  @Client("/")
  HttpClient client;

  private HttpClientResponseException call(HttpRequest<?> req) {
    return assertThrows(HttpClientResponseException.class, () -> client.toBlocking().exchange(req, String.class));
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> body(HttpClientResponseException ex) {
    return (Map<String, Object>) ex.getResponse().getBody(Map.class).orElseThrow();
  }

  @Test
  void apiExceptionBody() throws Exception {
    var ex = call(HttpRequest.GET("/test-errors/conflict"));
    assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    var json = body(ex);
    assertEquals("Email or username already in use", json.get("error"));
    assertFalse(json.containsKey("issues"), json.toString());
  }

  @Test
  @SuppressWarnings("unchecked")
  void validationBody() throws Exception {
    var ex = call(HttpRequest.POST("/test-errors/validate", Map.of("username", "")));
    assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus(), ex.getResponse().getBody(String.class).orElse("-"));
    var json = body(ex);
    var issues = (List<Map<String, Object>>) json.get("issues");
    assertEquals("username", issues.get(0).get("path"));
    assertEquals(issues.get(0).get("message"), json.get("error"));
  }

  @Test
  void unknownExceptionShowsMessageOutsideProd() throws Exception {
    var ex = call(HttpRequest.GET("/test-errors/boom"));
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, ex.getStatus());
    assertEquals("kaboom", body(ex).get("error"));
  }

  @Test
  void routingErrorsKeepTheirStatus() {
    assertEquals(HttpStatus.NOT_FOUND, call(HttpRequest.GET("/no-such-route")).getStatus());
  }
}

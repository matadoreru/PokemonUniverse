package es.pokemonuniverse.adapters.in.rest.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.micronaut.http.HttpRequest;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import org.junit.jupiter.api.Test;

class ClientAddressTest {

  @Test
  void usesLastForwardedHop() {
    var request = HttpRequest.GET("/api/games").header("X-Forwarded-For", "1.1.1.1, 2.2.2.2");
    assertEquals("2.2.2.2", ClientAddress.of(request));
  }

  @Test
  void fallsBackToRemote() {
    assertEquals("10.0.0.5", ClientAddress.of(withRemote(HttpRequest.GET("/api/games"), "10.0.0.5")));
  }

  @Test
  void ignoresEmptyHeader() {
    var request = HttpRequest.GET("/api/games").header("X-Forwarded-For", ",");
    assertEquals("10.0.0.5", ClientAddress.of(withRemote(request, "10.0.0.5")));
  }

  @Test
  void isUnknownWithoutAnyAddress() {
    assertEquals(ClientAddress.UNKNOWN, ClientAddress.of(withRemote(HttpRequest.GET("/api/games"), null)));
  }

  /** La petición del cliente no tiene dirección remota; se simula la del servidor. */
  @SuppressWarnings("unchecked")
  private static HttpRequest<?> withRemote(HttpRequest<?> real, String ip) {
    var address = ip == null ? null : new InetSocketAddress(ip, 1234);
    return (HttpRequest<?>) Proxy.newProxyInstance(
        HttpRequest.class.getClassLoader(), new Class<?>[] {HttpRequest.class},
        (proxy, method, args) -> method.getName().equals("getRemoteAddress")
            ? address
            : method.invoke(real, args));
  }
}

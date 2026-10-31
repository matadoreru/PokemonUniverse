package es.pokemonuniverse.adapters.in.ws;

import static es.pokemonuniverse.adapters.in.ws.WsTestClients.assertError;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.application.auth.IdentityTokens;
import io.micronaut.context.annotation.Property;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.websocket.WebSocketClient;
import jakarta.inject.Inject;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Con un idle-timeout de 3 s, el latido de 1 s mantiene viva una conexión que no envía nada. */
@MicronautTest(transactional = false)
@Property(name = "micronaut.server.idle-timeout", value = "3s")
@Property(name = "micronaut.server.read-idle-timeout", value = "3s")
@Property(name = "micronaut.server.write-idle-timeout", value = "3s")
@Property(name = "pu.ws.heartbeat-seconds", value = "1")
class WsHeartbeatTest {

  @Inject @Client("/") WebSocketClient client;
  @Inject IdentityTokens tokens;
  private WsTestClients clients;

  @AfterEach
  void closeSockets() {
    clients.closeAll();
  }

  @Test
  void heartbeatKeepsAQuietConnectionOpenPastTheIdleTimeout() {
    clients = new WsTestClients(client, tokens);
    var socket = clients.connect(clients.user("ws_quiet", "Quiet"));
    assertThrows(TimeoutException.class, () -> socket.closed.get(5, TimeUnit.SECONDS));
    assertError("Not in a room", socket.command("room:leave", null));
  }
}

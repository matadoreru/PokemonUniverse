package es.pokemonuniverse.adapters.in.ws;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.application.auth.IdentityTokens;
import io.micronaut.context.annotation.Property;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.websocket.CloseReason;
import io.micronaut.websocket.WebSocketClient;
import jakarta.inject.Inject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Contraprueba de {@link WsHeartbeatTest}: sin latido, Netty cierra la conexión inactiva (1001). */
@MicronautTest(transactional = false)
@Property(name = "micronaut.server.idle-timeout", value = "3s")
@Property(name = "micronaut.server.read-idle-timeout", value = "3s")
@Property(name = "micronaut.server.write-idle-timeout", value = "3s")
@Property(name = "pu.ws.heartbeat-seconds", value = "0")
class WsHeartbeatDisabledTest {

  @Inject @Client("/") WebSocketClient client;
  @Inject IdentityTokens tokens;
  private WsTestClients clients;

  @AfterEach
  void closeSockets() {
    clients.closeAll();
  }

  @Test
  void quietConnectionIsClosedWithoutHeartbeat() {
    clients = new WsTestClients(client, tokens);
    var socket = clients.connect(clients.user("ws_idle", "Idle"));
    assertEquals(CloseReason.GOING_AWAY.getCode(), socket.awaitClose().getCode());
  }
}

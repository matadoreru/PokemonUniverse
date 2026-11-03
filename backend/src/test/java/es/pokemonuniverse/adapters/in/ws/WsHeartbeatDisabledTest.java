package es.pokemonuniverse.adapters.in.ws;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.application.auth.IdentityTokens;
import io.micronaut.context.annotation.Property;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.websocket.CloseReason;
import io.micronaut.websocket.WebSocketClient;
import jakarta.inject.Inject;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * Contraprueba de {@link WsHeartbeatTest}: sin latido, Netty cierra la conexión inactiva (1001).
 * El cierre llega a los 3 s de inactividad; bajo la carga de {@code ./gradlew check} completo el detector de
 * inactividad de Netty y el reparto del evento pueden retrasarse, así que la espera del cierre tiene un plazo
 * holgado (30 s) que solo cuenta si el cierre no llega: en condiciones normales la prueba dura unos 3 s.
 */
@MicronautTest(transactional = false)
@Property(name = "micronaut.server.idle-timeout", value = "3s")
@Property(name = "micronaut.server.read-idle-timeout", value = "3s")
@Property(name = "micronaut.server.write-idle-timeout", value = "3s")
@Property(name = "pu.ws.heartbeat-seconds", value = "0")
class WsHeartbeatDisabledTest {

  private static final Duration CLOSE_WAIT = Duration.ofSeconds(30);

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
    assertEquals(CloseReason.GOING_AWAY.getCode(), socket.awaitClose(CLOSE_WAIT).getCode());
  }
}

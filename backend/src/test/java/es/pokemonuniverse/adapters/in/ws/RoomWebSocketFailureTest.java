package es.pokemonuniverse.adapters.in.ws;

import static es.pokemonuniverse.adapters.in.ws.WsTestClients.assertError;
import static org.junit.jupiter.api.Assertions.assertFalse;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.rooms.GameCatalogProvider;
import es.pokemonuniverse.application.rooms.GameResultsPersister;
import es.pokemonuniverse.application.rooms.HostContentProvider;
import es.pokemonuniverse.application.rooms.RoomAuditSink;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.rooms.RoomEvents;
import es.pokemonuniverse.application.rooms.RoomSchedulers;
import es.pokemonuniverse.application.rooms.RoomSettings;
import es.pokemonuniverse.application.rooms.UserGameConfigPreferences;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.application.time.RandomSource;
import es.pokemonuniverse.domain.game.GameRegistry;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.websocket.WebSocketClient;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Un {@link Error} dentro de un comando (p. ej. de un motor) se responde con un ack y no deja al cliente esperando. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "RoomWebSocketFailureTest")
class RoomWebSocketFailureTest {

  @Singleton
  @Replaces(RoomCoordinator.class)
  @Requires(property = "spec.name", value = "RoomWebSocketFailureTest")
  static class ExplodingCoordinator extends RoomCoordinator {

    ExplodingCoordinator(GameRegistry registry, JsonMapper json, RoomEvents events, RoomAuditSink audit,
        GameResultsPersister results, UserGameConfigPreferences userGameConfigs, HostContentProvider hostContent,
        Clock clock, RandomSource random, RoomSchedulers schedulers, RoomSettings settings,
        GameCatalogProvider catalog) {
      super(registry, json, events, audit, results, userGameConfigs, hostContent, clock, random, schedulers, settings,
          catalog);
    }

    @Override
    public void leave(String playerId) {
      throw new AssertionError("motor roto");
    }

    @Override
    public void updateWhoIsWhoCursor(String playerId, String connectionId, @Nullable JsonNode payload) {
      throw new AssertionError("cursor roto");
    }
  }

  @Inject @Client("/") WebSocketClient client;
  @Inject IdentityTokens tokens;
  private WsTestClients clients;

  @AfterEach
  void closeSockets() {
    clients.closeAll();
  }

  @Test
  void acksErrorsThrownAsThrowable() {
    clients = new WsTestClients(client, tokens);
    var socket = clients.connect(clients.user("ws_error", "Error"));
    assertError("Unexpected error", socket.command("room:leave", null));
    assertError("Cursor rechazado", socket.command("who-is-who:cursor", "{\"x\":0.5,\"y\":0.5}"));
    assertError("Not in a room", socket.command("room:set-ready", "{\"ready\":true}"));
    assertFalse(socket.closed.isDone());
  }
}

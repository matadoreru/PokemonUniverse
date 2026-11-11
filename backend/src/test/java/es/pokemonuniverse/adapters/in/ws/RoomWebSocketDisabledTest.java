package es.pokemonuniverse.adapters.in.ws;

import static org.junit.jupiter.api.Assertions.assertEquals;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.assets.GameAssetService;
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
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.json.JsonMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.websocket.WebSocketClient;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Con {@code pu.rooms.enabled=false}, {@code /ws} cierra con 4403 sin tocar el coordinador. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "RoomWebSocketDisabledTest")
@Property(name = "pu.rooms.enabled", value = "false")
class RoomWebSocketDisabledTest {

  @Singleton
  @Replaces(RoomCoordinator.class)
  @Requires(property = "spec.name", value = "RoomWebSocketDisabledTest")
  static class CountingCoordinator extends RoomCoordinator {

    final AtomicInteger connects = new AtomicInteger();

    CountingCoordinator(GameRegistry registry, JsonMapper json, RoomEvents events, RoomAuditSink audit,
        GameResultsPersister results, UserGameConfigPreferences userGameConfigs, HostContentProvider hostContent,
        Clock clock, RandomSource random, RoomSchedulers schedulers, RoomSettings settings,
        GameCatalogProvider catalog, GameAssetService assets) {
      super(registry, json, events, audit, results, userGameConfigs, hostContent, clock, random, schedulers, settings,
          catalog, assets);
    }

    @Override
    public boolean connect(AuthUser identity, String connectionId) {
      connects.incrementAndGet();
      return super.connect(identity, connectionId);
    }
  }

  @Inject @Client("/") WebSocketClient client;
  @Inject IdentityTokens tokens;
  @Inject CountingCoordinator coordinator;
  private WsTestClients clients;

  @AfterEach
  void closeSockets() {
    clients.closeAll();
  }

  @Test
  void closesWith4403AndNeverConnects() {
    clients = new WsTestClients(client, tokens);
    var socket = clients.connect(clients.user("ws_disabled", "Disabled"));
    assertEquals(4403, socket.awaitClose().getCode());
    assertEquals(0, coordinator.connects.get());
  }
}

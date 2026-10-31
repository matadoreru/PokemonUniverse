package es.pokemonuniverse.application.rooms;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import es.pokemonuniverse.adapters.out.persistence.GameHistoryRepository;
import es.pokemonuniverse.adapters.out.persistence.GameHistoryStatus;
import es.pokemonuniverse.adapters.out.persistence.JpaGameResultsPersister;
import es.pokemonuniverse.adapters.out.persistence.JpaRoomAuditSink;
import es.pokemonuniverse.adapters.out.persistence.RoomHistoryRepository;
import es.pokemonuniverse.adapters.out.persistence.RoomHistoryStatus;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Requires;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.junit.jupiter.api.Test;

/** El grafo de beans de producción construye el coordinador con los adaptadores JPA y los ajustes de {@code pu.*}. */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "RoomCoordinatorWiringTest")
@Property(name = "pu.room-max-players", value = "6")
class RoomCoordinatorWiringTest {

  @Singleton
  @Requires(property = "spec.name", value = "RoomCoordinatorWiringTest")
  static class NoEvents implements RoomEvents {
    @Override
    public void sendToMember(String memberId, String connectionId, String event, Object payload) {}

    @Override
    public void kick(String memberId, String connectionId, String reason) {}
  }

  @Inject RoomCoordinator coordinator;
  @Inject RoomAuditSink audit;
  @Inject GameResultsPersister persister;
  @Inject RoomHistoryRepository rooms;
  @Inject GameHistoryRepository games;

  @Test
  void wiresJpaAdaptersAndAuditsThroughTheDatabase() {
    assertInstanceOf(JpaRoomAuditSink.class, audit);
    assertInstanceOf(JpaGameResultsPersister.class, persister);
    var host = new AuthUser("guest_wiring", "Host", AuthUser.Kind.GUEST, null, null, new AvatarRef.Default());
    var view = coordinator.create(host, "conn-1", null);
    assertEquals(6, view.maxPlayers());
    coordinator.leave(host.id());
    coordinator.flush();
    var history = rooms.findById(view.roomInstanceId()).orElseThrow();
    assertEquals(RoomHistoryStatus.CLOSED, history.getStatus());
    assertEquals("EMPTY_AFTER_LEAVE", history.getCloseReason());
    assertEquals(0, games.findByRoomHistoryId(view.roomInstanceId()).stream()
        .filter(game -> game.getStatus() == GameHistoryStatus.IN_PROGRESS).count());
  }
}

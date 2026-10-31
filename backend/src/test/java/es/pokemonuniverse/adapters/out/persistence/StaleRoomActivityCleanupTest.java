package es.pokemonuniverse.adapters.out.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.context.ApplicationContext;
import io.micronaut.context.annotation.Property;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * {@code interruptStaleActivity} al arrancar solo con {@code pu.interrupt-stale-rooms=true}: por defecto Java no toca
 * las salas vivas de Node sobre la misma base de datos.
 */
class StaleRoomActivityCleanupTest {

  @Nested
  @MicronautTest(transactional = false)
  class DisabledByDefault {

    @Inject ApplicationContext context;

    @Test
    void beanIsAbsent() {
      assertFalse(context.containsBean(StaleRoomActivityCleanup.class));
    }
  }

  @Nested
  @MicronautTest(transactional = false, rebuildContext = true)
  @Property(name = "pu.interrupt-stale-rooms", value = "true")
  class EnabledByProperty {

    @Inject ApplicationContext context;
    @Inject RoomHistoryWriter writer;
    @Inject RoomHistoryRepository rooms;

    @Test
    void beanRunsAtStartupAndInterruptsActiveRooms() {
      assertTrue(context.containsBean(StaleRoomActivityCleanup.class));
      var id = UUID.randomUUID().toString();
      writer.roomCreated(id, "CCCCCC", null, "Host", 8, Instant.now());
      context.getBean(StaleRoomActivityCleanup.class).interrupt();
      var room = rooms.findById(id).orElseThrow();
      assertEquals(RoomHistoryStatus.INTERRUPTED, room.getStatus());
      assertEquals("SERVER_STOPPED", room.getCloseReason());
    }
  }
}

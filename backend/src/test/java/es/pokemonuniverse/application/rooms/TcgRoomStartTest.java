package es.pokemonuniverse.application.rooms;

import static es.pokemonuniverse.application.rooms.RoomTestKit.guest;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.application.datasync.tcg.TcgTables;
import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import es.pokemonuniverse.domain.game.engines.tcghigherlower.TcgHigherLowerEngine;
import es.pokemonuniverse.domain.room.LiveRoom;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * Las salas Java reciben el catálogo TCG real ({@code tcgCards} del contexto, como el {@code RoomManager} de Node): con
 * cartas sembradas {@code tcg-higher-lower} arranca; sin cartas responde su literal de no disponibilidad.
 */
@MicronautTest(transactional = false)
class TcgRoomStartTest {

  @Inject RoomCoordinator rooms;
  @Inject CachedTcgCardCatalog catalog;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

  @AfterEach
  void clean() throws Exception {
    try (var connection = resolver.resolve(dataSource).getConnection()) {
      TcgTables.clear(connection);
      TcgTables.deletePokemon(connection);
    }
    catalog.refresh();
  }

  private LiveRoom lobby(String prefix) {
    var host = guest(prefix + "-host", "Host");
    var room = rooms.store.get(rooms.create(host, prefix + "-h", null).code());
    RoomTestKit.join(rooms, guest(prefix + "-guest", "Ana"), prefix + "-g", room.code);
    rooms.selectGame(host.id(), TcgHigherLowerEngine.ID);
    RoomTestKit.setReady(rooms, prefix + "-guest", true);
    return room;
  }

  @Test
  void withSeededCardsTheGameStarts() throws Exception {
    try (var connection = resolver.resolve(dataSource).getConnection()) {
      TcgTables.clear(connection);
      TcgTables.seedCatalog(connection);
    }
    catalog.refresh();
    var room = lobby("tcg-ok");
    rooms.startGame("tcg-ok-host");
    assertNotNull(room.game);
    assertEquals(TcgHigherLowerEngine.ID, room.game.gameId);
    rooms.leave("tcg-ok-guest");
    rooms.leave("tcg-ok-host");
  }

  @Test
  void withoutCardsTheGameAnswersItsLiteral() throws Exception {
    try (var connection = resolver.resolve(dataSource).getConnection()) {
      TcgTables.clear(connection);
    }
    catalog.refresh();
    lobby("tcg-empty");
    var error = assertThrows(RoomException.class, () -> rooms.startGame("tcg-empty-host"));
    assertEquals("Higher or Lower: Cartas: No hay al menos dos cartas TCG con imagen y precio comparable para estos"
        + " filtros.", error.getMessage());
    rooms.endSession("tcg-empty-host");
  }
}

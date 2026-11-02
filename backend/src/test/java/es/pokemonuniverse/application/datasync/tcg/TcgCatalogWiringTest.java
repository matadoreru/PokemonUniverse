package es.pokemonuniverse.application.datasync.tcg;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.datasync.DataSyncAdapter;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncService;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import io.micronaut.context.BeanContext;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.micronaut.test.support.TestPropertyProvider;
import jakarta.inject.Inject;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Arranque del catálogo TCG ({@code index.ts}): {@code tcgCards.refresh()} al arrancar aunque el data-sync esté apagado
 * (solo lee la BD) y otra vez tras cada sincronización TCGDEX completada ({@code onCompleted}). Con el data-sync
 * apagado, TCGdex no recibe ninguna petición al arrancar.
 */
@MicronautTest(transactional = false)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TcgCatalogWiringTest implements TestPropertyProvider {

  private final TcgDexFixtureServer server;

  @Inject BeanContext context;
  @Inject CachedTcgCardCatalog catalog;
  @Inject DataSyncService service;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

  TcgCatalogWiringTest() {
    try {
      server = new TcgDexFixtureServer();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @Override
  public Map<String, String> getProperties() {
    return Map.of("pu.data-sync.tcgdex-base-url", server.urls().base());
  }

  @AfterAll
  void stopServer() {
    server.close();
  }

  @AfterEach
  void clean() throws Exception {
    try (var connection = resolver.resolve(dataSource).getConnection(); var statement = connection.createStatement()) {
      TcgTables.clear(connection);
      TcgTables.deletePokemon(connection);
      statement.executeUpdate("DELETE FROM \"DataSyncRun\"");
      statement.executeUpdate("DELETE FROM \"DataSyncState\"");
    }
    catalog.refresh();
  }

  @Test
  void theTcgdexAdapterIsABeanAndTheRoomsSeeTheCachedCatalog() {
    var adapters = context.getBeansOfType(DataSyncAdapter.class).stream()
        .filter(adapter -> adapter.source() == DataSyncSource.TCGDEX).toList();
    assertEquals(1, adapters.size());
    assertInstanceOf(TcgDataSync.class, adapters.getFirst());
    assertEquals(catalog, context.getBean(TcgCardCatalog.class));
  }

  @Test
  void theCatalogIsLoadedAtStartupWithoutContactingTcgdex() {
    assertTrue(catalog.loaded());
    assertEquals(List.of(), server.requests());
  }

  @Test
  void aCompletedTcgdexSyncRefreshesTheCatalog() throws Exception {
    try (var connection = resolver.resolve(dataSource).getConnection()) {
      TcgTables.clear(connection);
      TcgTables.insertPokemon(connection);
    }
    catalog.refresh();
    var all = new TcgCardCatalog.Filters(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9), List.of(), List.of(), null, null);
    assertEquals(List.of(), catalog.cardsFor(all));
    service.start(DataSyncSource.TCGDEX, DataSyncMode.INITIAL).get();
    assertEquals(6, catalog.cardsFor(all).size());
    assertEquals(6, catalog.options().cardCount());
  }
}

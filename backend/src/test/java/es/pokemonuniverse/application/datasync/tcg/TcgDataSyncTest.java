package es.pokemonuniverse.application.datasync.tcg;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.http.SyncHttpClient;
import es.pokemonuniverse.adapters.out.persistence.NonUtcZone;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.SyncResult;
import es.pokemonuniverse.application.tcg.CachedTcgCardCatalog;
import es.pokemonuniverse.application.tcg.TcgCardRepository;
import es.pokemonuniverse.application.tcg.TcgFixtures;
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.net.http.HttpClient;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * {@code TcgDataSync.run} ({@code tcg-data-sync.ts}) contra Postgres real y TCGdex grabado. Las tablas, los resultados,
 * las peticiones y la lectura del catálogo se comparan con {@code expected-sync.json}: el {@code TcgDataSync} y el
 * {@code PrismaTcgCardRepository} de Node sobre las mismas respuestas y los mismos Pokémon
 * ({@code scripts/export-tcg-parity.mts}).
 */
@MicronautTest(transactional = false)
class TcgDataSyncTest {

  static final JsonNode EXPECTED = TcgFixtures.read("/datasync/tcgdex/expected-sync.json");

  @Inject TcgCatalogStore store;
  @Inject TcgCardRepository repository;
  @Inject JsonMapper json;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

  private TcgDexFixtureServer server;
  private final List<Long> sleeps = Collections.synchronizedList(new ArrayList<>());
  private TcgDataSync sync;

  @BeforeEach
  void setUp() throws Exception {
    try (var connection = connection()) {
      TcgTables.clear(connection);
      TcgTables.insertPokemon(connection);
    }
    server = new TcgDexFixtureServer();
    var http = new SyncHttpClient(json, System::currentTimeMillis, HttpClient.newHttpClient(),
        SyncHttpClient.Options.DEFAULTS, millis -> {}, () -> 0);
    sync = new TcgDataSync(store, http, server.urls(), sleeps::add, System::currentTimeMillis);
  }

  @AfterEach
  void tearDown() throws Exception {
    server.close();
    try (var connection = connection()) {
      TcgTables.clear(connection);
      TcgTables.deletePokemon(connection);
    }
  }

  private Connection connection() throws SQLException {
    return resolver.resolve(dataSource).getConnection();
  }

  private Map<String, Object> dump() throws Exception {
    try (var connection = connection()) {
      return TcgTables.dump(connection);
    }
  }

  private static Object result(SyncResult result) {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("processed", result.processed());
    value.put("inserted", result.inserted());
    value.put("updated", result.updated());
    value.put("skipped", result.skipped());
    value.put("datasetVersion", result.datasetVersion());
    value.put("details", result.details());
    return TcgFixtures.plain(value);
  }

  private void assertTables(JsonNode expected) throws Exception {
    var tables = TcgTables.expected(expected);
    var actual = dump();
    assertEquals(tables.keySet(), actual.keySet());
    for (var table : tables.keySet()) assertEquals(tables.get(table), actual.get(table), table);
  }

  private static List<String> sorted(List<String> values) {
    var copy = new ArrayList<>(values);
    Collections.sort(copy);
    return copy;
  }

  private static List<String> strings(JsonNode node) {
    var values = new ArrayList<String>();
    node.values().forEach(value -> values.add(value.getStringValue()));
    return values;
  }

  @Test
  void theAdapterIsTheTcgdexSource() {
    assertEquals(DataSyncSource.TCGDEX, sync.source());
  }

  /**
   * Con la JVM fuera de UTC ({@link NonUtcZone}): las fechas ({@code releaseDate} del volcado, {@code sourceUpdatedAt})
   * deben quedar en UTC también en un CI que corra en UTC.
   */
  @Test
  void anInitialRunEndsExactlyLikeNode() throws Exception {
    try (var zone = NonUtcZone.pin()) {
      initialRunEndsExactlyLikeNode();
    }
  }

  private void initialRunEndsExactlyLikeNode() throws Exception {
    var expected = EXPECTED.get("initial");
    var result = sync.run(DataSyncMode.INITIAL);
    assertEquals(TcgFixtures.plain(expected.get("result")), result(result));
    // Los sets van en orden; las cartas de un lote, concurrentes. La carta sin set.id se pide pero se salta;
    // base1-4 aparece en dos sets y se pide una vez.
    var requests = server.requests();
    var expectedRequests = strings(expected.get("requests"));
    assertEquals(expectedRequests.subList(0, 3), requests.subList(0, 3));
    assertEquals(sorted(expectedRequests.subList(3, expectedRequests.size())), sorted(requests.subList(3, requests.size())));
    assertTables(expected.get("tables"));
    assertEquals(List.of(100L), sleeps);
    assertEquals(8, sync.recordsAvailable());
    try (var connection = connection()) {
      assertEquals(Instant.parse("2025-08-18T17:41:34Z"), TcgTables.sourceUpdatedAt(connection, "base1-4"));
    }
  }

  /** {@code loadComparableCards} y el catálogo encima de la BD sincronizada, frente al repositorio Prisma de Node. */
  @Test
  void theRepositoryAndCatalogReadTheSyncedRowsLikeNode() throws Exception {
    sync.run(DataSyncMode.INITIAL);
    var expected = EXPECTED.get("catalog");
    var loaded = new ArrayList<Object>();
    var rows = new ArrayList<>(repository.loadComparableCards());
    rows.sort(Comparator.comparing(TcgCardRepository.CardRow::id));
    for (var row : rows) loaded.add(TcgTables.nodeShape(row));
    assertEquals(TcgFixtures.plain(expected.get("loaded")), TcgFixtures.plain(loaded));
    var catalog = new CachedTcgCardCatalog(repository);
    catalog.refresh();
    assertEquals(TcgFixtures.plain(expected.get("options")), TcgFixtures.plain(catalog.options()));
    var pool = new ArrayList<>(catalog.cardsFor(new TcgCardCatalog.Filters(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9),
        List.of(), List.of(), null, null)));
    pool.sort(Comparator.comparing(TcgCardCatalog.Card::id));
    assertEquals(TcgFixtures.plain(expected.get("allGenerations")), TcgFixtures.plain(pool));
  }

  @Test
  void aPriceRefreshSkipsSetsAndOnlyUpdatesPricesLikeNode() throws Exception {
    sync.run(DataSyncMode.INITIAL);
    server.clearRequests();
    server.refreshPrices(true);
    var expected = EXPECTED.get("priceRefresh");
    var result = sync.run(DataSyncMode.PRICE_REFRESH);
    assertEquals(TcgFixtures.plain(expected.get("result")), result(result));
    var requests = new ArrayList<>(server.requests());
    Collections.sort(requests);
    assertEquals(strings(expected.get("requests")), requests);
    assertTrue(requests.stream().noneMatch(path -> path.contains("/sets")));
    // El nombre cambiado de base1-4 no se escribe: solo sus precios.
    assertTables(expected.get("tables"));
  }

  @Test
  void aPriceRefreshWithoutCardsDiscoversThemThroughTheSets() throws Exception {
    var result = sync.run(DataSyncMode.PRICE_REFRESH);
    assertEquals("/v2/en/sets", server.requests().getFirst());
    assertEquals(List.of(9, 8, 0, 1), List.of(result.processed(), result.inserted(), result.updated(),
        result.skipped()));
    assertEquals(TcgFixtures.plain(Map.of("pricesRefreshed", true)), TcgFixtures.plain(result.details()));
  }
}

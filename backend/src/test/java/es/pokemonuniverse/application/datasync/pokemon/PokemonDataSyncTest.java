package es.pokemonuniverse.application.datasync.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.http.SyncHttpClient;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncRecords;
import es.pokemonuniverse.application.datasync.DataSyncService;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.SyncResult;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.json.JsonMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.net.http.HttpClient;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * {@code PokemonDataSync.run} ({@code pokemon-data-sync.ts}) contra Postgres real y PokéAPI grabada. El estado final de
 * una ejecución completa se compara con {@code expected-run.json}: Node ejecutando {@code syncPokemonData},
 * {@code backfillNormalizedData} y {@code syncMissingPokemonPalettes} sobre las mismas respuestas.
 */
@MicronautTest(transactional = false)
class PokemonDataSyncTest {

  private static final String SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";

  @Inject PokemonCatalogStore store;
  @Inject JsonMapper json;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;
  @Inject DataSyncRecords records;

  private PokeApiFixtureServer server;
  private PokemonPaletteSync palettes;
  private PokemonDataSync sync;

  @BeforeEach
  void setUp() throws Exception {
    clearCatalog();
    server = new PokeApiFixtureServer();
    var http = PokemonCatalogSeederTest.http(json);
    var seeder = new PokemonCatalogSeeder(store, http, server.urls(), System::currentTimeMillis);
    palettes = new PokemonPaletteSync(store, http, server.spriteBase(), System::currentTimeMillis);
    sync = new PokemonDataSync(store, seeder, palettes, http, server.urls(), PokemonCatalogSeederTest.LIMITS,
        System::currentTimeMillis);
  }

  @AfterEach
  void tearDown() throws Exception {
    server.close();
    clearCatalog();
  }

  private void clearCatalog() throws SQLException {
    try (var connection = resolver.resolve(dataSource).getConnection()) {
      CatalogTables.clear(connection);
    }
  }

  private Map<String, Object> dump() throws Exception {
    try (var connection = resolver.resolve(dataSource).getConnection()) {
      return CatalogTables.dump(connection);
    }
  }

  private void insertDefault(String id, int dex, String sprite, String metadata) throws SQLException {
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement("INSERT INTO \"Pokemon\" (\"id\", \"nationalDexNumber\", \"name\","
            + " \"generation\", \"isDefault\", \"sprite\", \"abilities\", \"types\", \"metadata\", \"updatedAt\")"
            + " VALUES (?, ?, ?, 1, true, ?, '{}', '{}', CAST(? AS jsonb), ?)")) {
      statement.setString(1, id);
      statement.setInt(2, dex);
      statement.setString(3, id);
      statement.setString(4, sprite);
      statement.setString(5, metadata);
      statement.setTimestamp(6, Timestamp.from(Instant.now()));
      statement.executeUpdate();
    }
  }

  private Object details(SyncResult result) {
    return CatalogTables.plain(result.details());
  }

  private static Object palettesDetails(int processed, int updated, int skipped, int failed) {
    return Map.of("palettes", Map.of("processed", (double) processed, "updated", (double) updated,
        "skipped", (double) skipped, "failed", (double) failed));
  }

  @Test
  void theAdapterIsThePokeApiSource() {
    assertEquals(DataSyncSource.POKEAPI, sync.source());
  }

  @Test
  void aFullRunOnAnEmptyDatabaseEndsExactlyLikeNode() throws Exception {
    var result = sync.run(DataSyncMode.FULL);
    assertEquals(List.of(4, 4, 0, 0), List.of(result.processed(), result.inserted(), result.updated(), result.skipped()));
    assertEquals("4", result.datasetVersion());
    var expected = ExtractorsTest.read("/datasync/pokeapi/expected-run.json");
    assertEquals(Map.of("palettes", CatalogTables.plain(expected.get("palettes"))), details(result));
    var tables = CatalogTables.expected(expected.get("tables"));
    var actual = dump();
    for (var table : tables.keySet()) assertEquals(tables.get(table), actual.get(table), table);
    assertEquals(3, sync.recordsAvailable());
    assertEquals(3, palettes.persisted());
  }

  /** El upsert forzado de Node sustituye {@code metadata} entera: las paletas se recalculan y el estado converge. */
  @Test
  void aSecondFullRunConvergesToTheSameRows() throws Exception {
    sync.run(DataSyncMode.FULL);
    var once = dump();
    var result = sync.run(DataSyncMode.FULL);
    assertEquals(List.of(4, 0, 4, 0), List.of(result.processed(), result.inserted(), result.updated(), result.skipped()));
    assertEquals(palettesDetails(3, 3, 0, 0), details(result));
    assertEquals(once, dump());
  }

  @Test
  void anIncrementalRunWithEnoughPalettesAndNoNewSpeciesIsSkippedWithoutDownloads() throws Exception {
    for (int i = 1; i <= 100; i++) {
      var sprite = SPRITES + i + ".png";
      insertDefault("p" + i, i, sprite, "{\"palette\":[\"#183048\",\"#d86048\",\"#f0c030\"],"
          + "\"paletteWeights\":[0.5,0.3,0.2],\"paletteVersion\":3,\"paletteSpriteUrl\":\"" + sprite + "\"}");
    }
    server.override("/api/v2/pokemon-species?limit=1", PokeApiFixtureServer.Canned.json("{\"count\":100}"));
    var result = sync.run(DataSyncMode.INCREMENTAL);
    assertEquals(List.of(0, 0, 0, 100), List.of(result.processed(), result.inserted(), result.updated(), result.skipped()));
    assertEquals("100", result.datasetVersion());
    assertEquals(Map.of("changeDetected", false, "paletteCount", 100.0), details(result));
    assertEquals(List.of("/api/v2/pokemon-species?limit=1"), server.requests());
  }

  @Test
  void anIncrementalRunBelowThePaletteMinimumSyncsWithoutAskingTheRemoteCount() throws Exception {
    sync.run(DataSyncMode.FULL);
    server.clearRequests();
    var result = sync.run(DataSyncMode.INCREMENTAL);
    // Menos de 100 paletas: no se pregunta el recuento remoto; catálogo completo y paletas vigentes: nada que bajar.
    assertEquals(List.of(), server.requests());
    assertEquals(List.of(4, 0, 4, 4), List.of(result.processed(), result.inserted(), result.updated(), result.skipped()));
    assertEquals(palettesDetails(3, 0, 3, 0), details(result));
  }

  /** Un sprite de un host no confiable o que no se puede descargar cuenta como fallido sin abortar la ejecución. */
  @Test
  void untrustedOrBrokenSpritesCountAsFailedWithoutAborting() throws Exception {
    insertDefault("evil", 9_999, "http://example.com/evil.png", "null");
    insertDefault("missing", 9_998, SPRITES + "9998.png", "{}");
    var result = sync.run(DataSyncMode.FULL);
    assertEquals(palettesDetails(5, 3, 0, 2), details(result));
    assertTrue(server.requests().contains("/raw/PokeAPI/sprites/master/sprites/pokemon/9998.png"));
    assertTrue(server.requests().stream().noneMatch(path -> path.contains("evil")));
    assertEquals(3, palettes.persisted());
  }

  /**
   * Review Focus 2 de extremo a extremo (caracterización, no TDD): PokéAPI responde 429 con {@code Retry-After} a una
   * especie; el cliente espera lo indicado entre los 4 intentos, el adaptador real falla con el literal de Node y la
   * ejecución del {@link DataSyncService} queda FAILED con ese mensaje, sin escribir el catálogo.
   */
  @Test
  void aPersistent429WithRetryAfterLeavesTheRunFailedAndTheCatalogUntouched() throws Exception {
    try (var connection = resolver.resolve(dataSource).getConnection(); var statement = connection.createStatement()) {
      // Tablas propias del data-sync: DataSyncServiceTest y DataSyncStartupTest también las vacían.
      statement.executeUpdate("DELETE FROM \"DataSyncRun\"");
      statement.executeUpdate("DELETE FROM \"DataSyncState\"");
    }
    server.override("/api/v2/pokemon-species/75", PokeApiFixtureServer.Canned.status(429).withHeader("Retry-After", "2"));
    var sleeps = Collections.synchronizedList(new ArrayList<Long>());
    var http = new SyncHttpClient(json, System::currentTimeMillis, HttpClient.newHttpClient(),
        SyncHttpClient.Options.DEFAULTS, sleeps::add, () -> 0);
    var seeder = new PokemonCatalogSeeder(store, http, server.urls(), System::currentTimeMillis);
    var adapter = new PokemonDataSync(store, seeder, new PokemonPaletteSync(store, http, server.spriteBase(),
        System::currentTimeMillis), http, server.urls(), PokemonCatalogSeederTest.LIMITS, System::currentTimeMillis);
    var service = new DataSyncService(records, List.of(adapter), null, System::currentTimeMillis, Instant::now,
        Executors.newVirtualThreadPerTaskExecutor());
    try {
      var error = assertThrows(ExecutionException.class,
          () -> service.start(DataSyncSource.POKEAPI, DataSyncMode.FULL).get());
      assertEquals("PokéAPI returned 429 for species 75", error.getCause().getMessage());
    } finally {
      service.stop();
    }
    assertEquals(List.of(2_000L, 2_000L, 2_000L), sleeps, server.requests().toString());
    assertEquals(4, server.requests().stream().filter("/api/v2/pokemon-species/75"::equals).count());
    try (var connection = resolver.resolve(dataSource).getConnection(); var statement = connection.createStatement();
        var set = statement.executeQuery("SELECT \"status\"::text, \"error\" FROM \"DataSyncRun\"")) {
      assertTrue(set.next());
      assertEquals("FAILED", set.getString(1));
      assertEquals("PokéAPI returned 429 for species 75", set.getString(2));
    }
    dump().values().forEach(rows -> assertTrue(((List<?>) rows).isEmpty()));
  }

  /**
   * El SQL nativo del almacén corre dentro de la transacción de {@code backfillPokemon}: si la reconciliación falla
   * (dos habilidades en el mismo hueco), el {@code speciesId} ya escrito se deshace junto con todo lo demás.
   */
  @Test
  void aFailedReconciliationRollsBackTheWholeRow() throws Exception {
    insertDefault("broken", 9_997, SPRITES + "9997.png", "{\"abilityRelations\":["
        + "{\"id\":\"a\",\"name\":\"A\",\"slot\":1,\"isHidden\":false},"
        + "{\"id\":\"b\",\"name\":\"B\",\"slot\":1,\"isHidden\":false}]}");
    var error = assertThrows(IllegalStateException.class, () -> sync.backfillNormalizedData());
    assertEquals("Duplicate ability slot: 1", error.getMessage());
    try (var connection = resolver.resolve(dataSource).getConnection(); var statement = connection.createStatement();
        var set = statement.executeQuery("SELECT \"speciesId\", \"sourceUpdatedAt\" FROM \"Pokemon\" WHERE \"id\" = 'broken'")) {
      assertTrue(set.next());
      assertEquals(null, set.getObject(1));
      assertEquals(null, set.getObject(2));
    }
    var tables = dump();
    for (var table : List.of("Ability", "PokemonAbility", "PokemonType", "PokemonStat", "PokemonAssetReference")) {
      assertEquals(List.of(), tables.get(table), table);
    }
  }

  /** Un sprite que declara 20000×20000 se rechaza por la cabecera y cuenta como fallido; el resto sigue. */
  @Test
  void aDecompressionBombSpriteCountsAsFailed() throws Exception {
    insertDefault("bomb", 9_996, SPRITES + "9996.png", "{}");
    server.override("/raw/PokeAPI/sprites/master/sprites/pokemon/9996.png", new PokeApiFixtureServer.Canned(200,
        PaletteExtractorTest.pngHeaderOnly(20_000, 20_000), "image/png", Map.of()));
    var result = sync.run(DataSyncMode.FULL);
    assertEquals(palettesDetails(4, 3, 0, 1), details(result));
    assertEquals(3, palettes.persisted());
  }
}

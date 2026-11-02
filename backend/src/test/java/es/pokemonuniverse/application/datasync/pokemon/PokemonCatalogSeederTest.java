package es.pokemonuniverse.application.datasync.pokemon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.http.SyncHttpClient;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.json.JsonMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.net.http.HttpClient;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * {@code syncPokemonData} contra Postgres real y PokéAPI grabada (Geodude, Graveler, Golem y Geodude de Alola). Las
 * filas esperadas ({@code expected-seed.json}) salen de ejecutar el {@code seed.ts} de Node sobre las mismas respuestas
 * ({@code scripts/export-pokeapi-parity.mts}).
 */
@MicronautTest(transactional = false)
class PokemonCatalogSeederTest {

  /** El subconjunto grabado: rango 74..76, una forma regional y mínimos a 1. */
  static final SeederLimits LIMITS = new SeederLimits(74, 76, 1, 1, 1, 1, SeederLimits.PRODUCTION.generationEnds());
  /** 3 Pokémon + 3 especies + lista de formas + 1 forma + 5 habilidades + 4 movimientos (como Node). */
  static final int FIRST_PASS_REQUESTS = 17;

  @Inject PokemonCatalogStore store;
  @Inject JsonMapper json;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

  private PokeApiFixtureServer server;
  private PokemonCatalogSeeder seeder;

  static SyncHttpClient http(JsonMapper json) {
    return new SyncHttpClient(json, System::currentTimeMillis, HttpClient.newHttpClient(),
        SyncHttpClient.Options.DEFAULTS, millis -> {}, () -> 0);
  }

  @BeforeEach
  void setUp() throws Exception {
    clearCatalog();
    server = new PokeApiFixtureServer();
    seeder = new PokemonCatalogSeeder(store, http(json), server.urls(), System::currentTimeMillis);
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

  private Map<String, Object> dump() throws SQLException, IOException {
    try (var connection = resolver.resolve(dataSource).getConnection()) {
      return CatalogTables.dump(connection);
    }
  }

  private static Map<String, Object> expectedSeed() {
    return CatalogTables.expected(ExtractorsTest.read("/datasync/pokeapi/expected-seed.json"));
  }

  @Test
  void anEmptyDatabaseIsSeededExactlyLikeNode() throws Exception {
    seeder.sync(false, LIMITS);
    var actual = dump();
    var expected = expectedSeed();
    for (var table : expected.keySet()) assertEquals(expected.get(table), actual.get(table), table);
    assertEquals(FIRST_PASS_REQUESTS, server.requests().size());
  }

  @Test
  void aSecondPassWithoutForceMakesNoRequests() throws Exception {
    seeder.sync(false, LIMITS);
    server.clearRequests();
    seeder.sync(false, LIMITS);
    assertEquals(List.of(), server.requests());
    assertEquals(expectedSeed(), dump());
  }

  @Test
  void forceRepeatsEveryPhaseWithTheSameContent() throws Exception {
    seeder.sync(false, LIMITS);
    server.clearRequests();
    seeder.sync(true, LIMITS);
    assertEquals(FIRST_PASS_REQUESTS, server.requests().size());
    assertEquals(expectedSeed(), dump());
  }

  /** Una descarga que falla aborta antes de escribir nada, con el literal de {@code fetchJson} de Node. */
  @Test
  void aFailedDownloadWritesNothing() throws Exception {
    server.override("/api/v2/pokemon-species/75", PokeApiFixtureServer.Canned.status(503));
    var error = assertThrows(SyncHttpClient.SyncHttpException.class, () -> seeder.sync(false, LIMITS));
    assertEquals("PokéAPI returned 503 for species 75", error.getMessage());
    assertEquals(4, server.requests().stream().filter("/api/v2/pokemon-species/75"::equals).count());
    dump().values().forEach(rows -> assertTrue(((List<?>) rows).isEmpty()));
  }

  @Test
  void aMissingSpanishAbilityNameAbortsBeforeWritingPokemon() throws Exception {
    // Las URL de las respuestas conservan la barra final.
    server.override("/api/v2/ability/5/", PokeApiFixtureServer.Canned.json("{\"name\":\"sturdy\",\"names\":[]}"));
    var error = assertThrows(IllegalStateException.class, () -> seeder.sync(false, LIMITS));
    assertEquals("PokéAPI has no official Spanish name for ability sturdy", error.getMessage());
    assertEquals(List.of(), dump().get("Pokemon"));
  }
}

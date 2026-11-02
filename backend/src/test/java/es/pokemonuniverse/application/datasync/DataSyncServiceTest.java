package es.pokemonuniverse.application.datasync;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.errors.ConflictException;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** {@code DataSyncService} contra Postgres real con adaptadores falsos y reloj controlado. */
@MicronautTest(transactional = false)
class DataSyncServiceTest {

  private static final Instant T0 = Instant.parse("2026-11-02T08:00:00Z");
  private static final Instant NEXT = Instant.parse("2026-11-03T05:00:00Z");

  @Inject DataSyncRecords records;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;
  @Inject JsonMapper json;

  private final AtomicLong now = new AtomicLong(T0.toEpochMilli());

  /** Adaptador falso: {@code run} delega en una función y puede bloquearse hasta {@link #release}. */
  private final class FakeAdapter implements DataSyncAdapter {
    final DataSyncSource source;
    final List<DataSyncMode> modes = Collections.synchronizedList(new ArrayList<>());
    final CountDownLatch entered = new CountDownLatch(1);
    volatile CountDownLatch release = new CountDownLatch(0);
    volatile Function<DataSyncMode, SyncResult> behaviour = mode -> new SyncResult(1, 1, 0, 0);
    volatile long available = 7;

    FakeAdapter(DataSyncSource source) {
      this.source = source;
    }

    FakeAdapter blocking() {
      release = new CountDownLatch(1);
      return this;
    }

    @Override
    public DataSyncSource source() {
      return source;
    }

    @Override
    public SyncResult run(DataSyncMode mode) {
      modes.add(mode);
      entered.countDown();
      try {
        assertTrue(release.await(10, TimeUnit.SECONDS));
      } catch (InterruptedException e) {
        throw new IllegalStateException(e);
      }
      return behaviour.apply(mode);
    }

    @Override
    public long recordsAvailable() {
      return available;
    }
  }

  private FakeAdapter pokemon;
  private FakeAdapter tcg;
  private long palettes;

  @BeforeEach
  void clean() throws SQLException {
    execute("DELETE FROM \"DataSyncRun\"");
    execute("DELETE FROM \"DataSyncState\"");
    pokemon = new FakeAdapter(DataSyncSource.POKEAPI);
    tcg = new FakeAdapter(DataSyncSource.TCGDEX);
    palettes = 0;
  }

  private DataSyncService service(DataSyncAdapter... adapters) {
    return new DataSyncService(records, List.of(adapters), () -> palettes, now::get, () -> NEXT,
        Executors.newVirtualThreadPerTaskExecutor());
  }

  private DataSyncService service() {
    return service(pokemon, tcg);
  }

  private static <T> T await(CompletableFuture<T> future) throws Exception {
    return future.get(10, TimeUnit.SECONDS);
  }

  private static Throwable failure(CompletableFuture<?> future) {
    var error = assertThrows(ExecutionException.class, () -> future.get(10, TimeUnit.SECONDS));
    return error.getCause();
  }

  // --- acceso directo a las tablas -------------------------------------------------------------------------------

  private void execute(String sql, Object... params) throws SQLException {
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement(sql)) {
      for (int i = 0; i < params.length; i++) statement.setObject(i + 1, params[i]);
      statement.executeUpdate();
    }
  }

  private List<Map<String, Object>> rows(String sql) throws SQLException {
    var result = new ArrayList<Map<String, Object>>();
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement(sql);
        var set = statement.executeQuery()) {
      var meta = set.getMetaData();
      while (set.next()) {
        var row = new HashMap<String, Object>();
        for (int i = 1; i <= meta.getColumnCount(); i++) row.put(meta.getColumnLabel(i), set.getObject(i));
        result.add(row);
      }
    }
    return result;
  }

  private List<Map<String, Object>> runs() throws SQLException {
    return rows("SELECT \"id\", \"source\"::text AS \"source\", \"mode\"::text AS \"mode\", \"status\"::text AS \"status\","
        + " \"startedAt\", \"completedAt\", \"durationMs\", \"recordsProcessed\", \"inserted\", \"updated\", \"skipped\","
        + " \"error\", \"details\"::text AS \"details\" FROM \"DataSyncRun\" ORDER BY \"createdAt\"");
  }

  private Map<String, Object> state(DataSyncSource source) throws SQLException {
    var found = rows("SELECT \"datasetVersion\", \"lastSuccessAt\", \"lastAttemptAt\", \"lastFullSyncAt\","
        + " \"recordsAvailable\", \"lastError\", \"updatedAt\" FROM \"DataSyncState\" WHERE \"source\" = '"
        + source.name() + "'");
    return found.isEmpty() ? null : found.getFirst();
  }

  /** {@code timestamp(3)} sin zona guarda UTC, como Prisma. */
  private static Instant utc(Object value) {
    return ((Timestamp) value).toLocalDateTime().toInstant(java.time.ZoneOffset.UTC);
  }

  private JsonNode node(String text) throws IOException {
    return json.readValue(text, JsonNode.class);
  }

  // --- ejecución -------------------------------------------------------------------------------------------------

  @Test
  void aCompletedRunGoesFromRunningToCompletedWithCountersDurationAndState() throws Exception {
    var observed = new ArrayList<Object>();
    pokemon.behaviour = mode -> {
      try {
        observed.add(runs().getFirst().get("status"));
        observed.add(state(DataSyncSource.POKEAPI).get("lastAttemptAt"));
      } catch (SQLException e) {
        throw new IllegalStateException(e);
      }
      now.addAndGet(1_234);
      try {
        return new SyncResult(10, 3, 4, 3, "1025", node("{\"palettes\":{\"updated\":2}}"));
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
    };
    pokemon.available = 1_025;
    var result = await(service().start(DataSyncSource.POKEAPI, DataSyncMode.FULL));

    assertEquals(10, result.processed());
    assertEquals("RUNNING", observed.getFirst());
    assertEquals(T0, utc(observed.get(1)));
    var run = runs().getFirst();
    assertEquals("POKEAPI", run.get("source"));
    assertEquals("FULL", run.get("mode"));
    assertEquals("COMPLETED", run.get("status"));
    assertEquals(T0, utc(run.get("startedAt")));
    assertEquals(T0.plusMillis(1_234), utc(run.get("completedAt")));
    assertEquals(1_234, run.get("durationMs"));
    assertEquals(List.of(10, 3, 4, 3),
        List.of(run.get("recordsProcessed"), run.get("inserted"), run.get("updated"), run.get("skipped")));
    assertNull(run.get("error"));
    assertEquals(node("{\"palettes\":{\"updated\":2}}"), node((String) run.get("details")));
    var state = state(DataSyncSource.POKEAPI);
    assertEquals("1025", state.get("datasetVersion"));
    assertEquals(T0.plusMillis(1_234), utc(state.get("lastSuccessAt")));
    assertEquals(T0, utc(state.get("lastAttemptAt")));
    assertEquals(T0.plusMillis(1_234), utc(state.get("lastFullSyncAt")));
    assertEquals(1_025, state.get("recordsAvailable"));
    assertNull(state.get("lastError"));
    assertNotNull(state.get("updatedAt"));
  }

  @Test
  void anIncrementalRunKeepsTheLastFullSyncClearsTheErrorAndLeavesDetailsNull() throws Exception {
    var service = service();
    await(service.start(DataSyncSource.POKEAPI, DataSyncMode.INITIAL));
    pokemon.behaviour = mode -> {
      throw new IllegalStateException("PokéAPI caída");
    };
    failure(service.start(DataSyncSource.POKEAPI, DataSyncMode.FULL));
    assertEquals("PokéAPI caída", state(DataSyncSource.POKEAPI).get("lastError"));
    pokemon.behaviour = mode -> new SyncResult(5, 0, 0, 5);
    now.addAndGet(60_000);
    await(service.start(DataSyncSource.POKEAPI, DataSyncMode.INCREMENTAL));

    var state = state(DataSyncSource.POKEAPI);
    assertEquals(T0, utc(state.get("lastFullSyncAt")));
    assertEquals(T0.plusMillis(60_000), utc(state.get("lastSuccessAt")));
    assertNull(state.get("lastError"));
    assertNull(state.get("datasetVersion"));
    assertNull(runs().getLast().get("details"));
  }

  @Test
  void aFailingRunIsMarkedFailedWithTheMessageAndTheStateKeepsTheError() throws Exception {
    pokemon.behaviour = mode -> {
      now.addAndGet(500);
      throw new IllegalStateException("Pokémon returned HTTP 503");
    };
    var service = service();
    var error = failure(service.start(DataSyncSource.POKEAPI, DataSyncMode.INCREMENTAL));

    assertEquals("Pokémon returned HTTP 503", error.getMessage());
    assertFalse(service.isRunning());
    var run = runs().getFirst();
    assertEquals("FAILED", run.get("status"));
    assertEquals("Pokémon returned HTTP 503", run.get("error"));
    assertEquals(500, run.get("durationMs"));
    assertEquals(T0.plusMillis(500), utc(run.get("completedAt")));
    var state = state(DataSyncSource.POKEAPI);
    assertEquals("Pokémon returned HTTP 503", state.get("lastError"));
    assertEquals(T0, utc(state.get("lastAttemptAt")));
    assertNull(state.get("lastSuccessAt"));
  }

  @Test
  void aSourceWithoutAdapterFailsWithoutWritingARun() throws Exception {
    var error = failure(service(pokemon).start(DataSyncSource.TCGDEX, DataSyncMode.INITIAL));
    assertEquals("No sync adapter registered for TCGDEX", error.getMessage());
    assertTrue(runs().isEmpty());
  }

  // --- concurrencia ----------------------------------------------------------------------------------------------

  @Test
  void startingASourceThatIsRunningIsAConflict() throws Exception {
    pokemon.blocking();
    var service = service();
    var first = service.start(DataSyncSource.POKEAPI, DataSyncMode.FULL);
    assertTrue(service.isRunning(DataSyncSource.POKEAPI));
    var conflict = assertThrows(SyncAlreadyRunningException.class,
        () -> service.start(DataSyncSource.POKEAPI, DataSyncMode.INCREMENTAL));
    assertEquals("POKEAPI ya se está sincronizando", conflict.getMessage());
    assertInstanceOf(ConflictException.class, conflict);
    pokemon.release.countDown();
    await(first);
    assertFalse(service.isRunning(DataSyncSource.POKEAPI));
    assertEquals(1, runs().size());
  }

  @Test
  void startAllWhileAnotherSourceRunsFailsAsynchronously() throws Exception {
    tcg.blocking();
    var service = service();
    var running = service.start(DataSyncSource.TCGDEX, DataSyncMode.FULL);
    var all = service.startAll(DataSyncMode.INCREMENTAL);
    var error = failure(all);
    assertInstanceOf(SyncAlreadyRunningException.class, error);
    assertEquals("Ya hay una sincronización activa", error.getMessage());
    tcg.release.countDown();
    await(running);
    assertEquals(List.of(), pokemon.modes);
  }

  @Test
  void startAllRunsBothSourcesAndMapsIncrementalTcgToPriceRefresh() throws Exception {
    var service = service();
    var results = await(service.startAll(DataSyncMode.INCREMENTAL));
    assertEquals(2, results.size());
    assertEquals(List.of(DataSyncMode.INCREMENTAL), pokemon.modes);
    assertEquals(List.of(DataSyncMode.PRICE_REFRESH), tcg.modes);
    await(service.startAll(DataSyncMode.FULL));
    assertEquals(DataSyncMode.FULL, tcg.modes.getLast());
  }

  @Test
  void startAllFailsAsSoonAsOneSourceFails() throws Exception {
    pokemon.behaviour = mode -> {
      throw new IllegalStateException("caída");
    };
    tcg.blocking();
    var service = service();
    var all = service.startAll(DataSyncMode.FULL);
    assertEquals("caída", failure(all).getMessage());
    assertTrue(service.isRunning(DataSyncSource.TCGDEX));
    tcg.release.countDown();
    service.stop();
  }

  @Test
  void stopWaitsForActiveRunsAndThenRejectsNewOnes() throws Exception {
    pokemon.blocking();
    var service = service();
    var running = service.start(DataSyncSource.POKEAPI, DataSyncMode.FULL);
    assertTrue(pokemon.entered.await(10, TimeUnit.SECONDS));
    var stopped = CompletableFuture.runAsync(service::stop);
    Thread.sleep(100);
    assertFalse(stopped.isDone());
    pokemon.release.countDown();
    stopped.get(10, TimeUnit.SECONDS);
    assertTrue(running.isDone());
    var error = assertThrows(IllegalStateException.class,
        () -> service.start(DataSyncSource.TCGDEX, DataSyncMode.FULL));
    assertEquals("El servidor se está cerrando", error.getMessage());
    assertEquals("El servidor se está cerrando", failure(service.startAll(DataSyncMode.FULL)).getMessage());
  }

  // --- oyentes ---------------------------------------------------------------------------------------------------

  @Test
  void listenersRunInOrderInsideTheRunAndTheirErrorsAreSwallowed() throws Exception {
    var calls = Collections.synchronizedList(new ArrayList<String>());
    var service = service();
    service.onCompleted(source -> calls.add("first:" + source));
    service.onCompleted(source -> {
      calls.add("failing:" + source);
      throw new IllegalStateException("recarga rota");
    });
    var removed = service.onCompleted(source -> calls.add("removed:" + source));
    service.onCompleted(source -> calls.add("last:" + source + ":" + service.isRunning(source)));
    removed.run();

    var result = await(service.start(DataSyncSource.TCGDEX, DataSyncMode.PRICE_REFRESH));
    assertNotNull(result);
    assertEquals(List.of("first:TCGDEX", "failing:TCGDEX", "last:TCGDEX:true"), calls);
    assertEquals("COMPLETED", runs().getFirst().get("status"));

    pokemon.behaviour = mode -> {
      throw new IllegalStateException("caída");
    };
    failure(service.start(DataSyncSource.POKEAPI, DataSyncMode.FULL));
    assertEquals(3, calls.size());
  }

  // --- recuperación y arranque -----------------------------------------------------------------------------------

  @Test
  void recoverInterruptedFailsPendingAndRunningRuns() throws Exception {
    var earlier = Timestamp.valueOf("2026-11-01 10:00:00");
    execute("INSERT INTO \"DataSyncRun\" (\"id\", \"source\", \"mode\", \"status\", \"createdAt\") VALUES"
        + " ('r1', 'POKEAPI', 'FULL', 'RUNNING', ?), ('r2', 'TCGDEX', 'INITIAL', 'PENDING', ?),"
        + " ('r3', 'TCGDEX', 'FULL', 'COMPLETED', ?)", earlier, earlier, earlier);
    service().recoverInterrupted();
    var byId = new HashMap<Object, Map<String, Object>>();
    for (var row : runs()) byId.put(row.get("id"), row);
    for (var id : List.of("r1", "r2")) {
      assertEquals("FAILED", byId.get(id).get("status"));
      assertEquals("Servidor reiniciado durante la sincronización", byId.get(id).get("error"));
      assertEquals(T0, utc(byId.get(id).get("completedAt")));
    }
    assertEquals("COMPLETED", byId.get("r3").get("status"));
    assertNull(byId.get("r3").get("error"));
  }

  @Test
  void ensureInitialPokemonOnlyRecordsTheStateWhenTheCatalogAndPalettesAreReady() throws Exception {
    pokemon.available = 1_025;
    palettes = 100;
    service().ensureInitialPokemon();
    assertTrue(runs().isEmpty());
    var state = state(DataSyncSource.POKEAPI);
    assertEquals(1_025, state.get("recordsAvailable"));
    assertEquals("1025", state.get("datasetVersion"));

    // En una fila existente no se toca datasetVersion.
    pokemon.available = 1_030;
    service().ensureInitialPokemon();
    assertEquals(1_030, state(DataSyncSource.POKEAPI).get("recordsAvailable"));
    assertEquals("1025", state(DataSyncSource.POKEAPI).get("datasetVersion"));
  }

  @Test
  void ensureInitialPokemonRunsAnInitialSyncAndWaitsWhenSomethingIsMissing() throws Exception {
    pokemon.available = 1_025;
    palettes = 99;
    service().ensureInitialPokemon();
    assertEquals(List.of(DataSyncMode.INITIAL), pokemon.modes);
    assertEquals("COMPLETED", runs().getFirst().get("status"));

    pokemon.behaviour = mode -> {
      throw new IllegalStateException("sin red");
    };
    pokemon.available = 0;
    palettes = 500;
    var error = assertThrows(IllegalStateException.class, () -> service().ensureInitialPokemon());
    assertEquals("sin red", error.getMessage());
  }

  @Test
  void theInitialTcgSyncRunsInTheBackgroundOnlyWithoutCards() throws Exception {
    tcg.available = 0;
    tcg.blocking();
    var service = service();
    service.startInitialTcgInBackground();
    assertTrue(tcg.entered.await(10, TimeUnit.SECONDS));
    assertEquals(List.of(DataSyncMode.INITIAL), tcg.modes);
    tcg.release.countDown();
    service.stop();
    assertEquals("COMPLETED", runs().getFirst().get("status"));

    var other = new FakeAdapter(DataSyncSource.TCGDEX);
    other.available = 300;
    var withCards = service(pokemon, other);
    withCards.startInitialTcgInBackground();
    var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
    while (!Integer.valueOf(300).equals(state(DataSyncSource.TCGDEX).get("recordsAvailable"))
        && System.nanoTime() < deadline) {
      Thread.sleep(10);
    }
    withCards.stop();
    assertEquals(List.of(), other.modes);
    assertEquals(300, state(DataSyncSource.TCGDEX).get("recordsAvailable"));
    assertEquals(1, runs().size());
  }

  @Test
  void theInitialTcgFailureIsSwallowed() throws Exception {
    tcg.available = 0;
    tcg.behaviour = mode -> {
      throw new IllegalStateException("TCGdex caído");
    };
    tcg.blocking();
    var service = service();
    service.startInitialTcgInBackground();
    assertTrue(tcg.entered.await(10, TimeUnit.SECONDS));
    tcg.release.countDown();
    service.stop();
    assertEquals("FAILED", runs().getFirst().get("status"));
    assertEquals("TCGdex caído", runs().getFirst().get("error"));
  }

  // --- resumen ---------------------------------------------------------------------------------------------------

  @Test
  void overviewWithoutDataIsNotReadyForBothSources() {
    var items = service().overview();
    assertEquals(List.of(DataSyncSource.POKEAPI, DataSyncSource.TCGDEX),
        items.stream().map(SyncOverviewItem::source).toList());
    var expected = new SyncOverviewItem(DataSyncSource.POKEAPI, SyncOverviewItem.Status.NOT_READY, false, null, null,
        null, null, 0, 0, 0, 0, 0, null, "2026-11-03T05:00:00.000Z");
    assertEquals(expected, items.getFirst());
  }

  /** La forma JSON de {@code AdminDataSyncItem}: claves en orden y nulos presentes pese a la inclusión global. */
  @Test
  void overviewItemsSerializeWithNullsAndInNodeKeyOrder() throws IOException {
    var text = json.writeValueAsString(service().overview().getFirst());
    assertEquals("{\"source\":\"POKEAPI\",\"status\":\"NOT_READY\",\"ready\":false,\"lastSyncAt\":null,"
        + "\"lastAttemptAt\":null,\"lastFullSyncAt\":null,\"durationMs\":null,\"recordsProcessed\":0,\"inserted\":0,"
        + "\"updated\":0,\"skipped\":0,\"recordsAvailable\":0,\"error\":null,"
        + "\"nextSyncAt\":\"2026-11-03T05:00:00.000Z\"}", text);
  }

  @Test
  void overviewDerivesTheStatusFromTheLatestRunAndTheState() throws Exception {
    var service = service();
    pokemon.available = 1_025;
    pokemon.behaviour = mode -> {
      now.addAndGet(2_000);
      return new SyncResult(9, 1, 2, 6);
    };
    await(service.start(DataSyncSource.POKEAPI, DataSyncMode.FULL));
    tcg.behaviour = mode -> {
      throw new IllegalStateException("TCGdex returned HTTP 500");
    };
    failure(service.start(DataSyncSource.TCGDEX, DataSyncMode.INITIAL));

    var items = service.overview();
    var pokemonItem = items.getFirst();
    assertEquals(SyncOverviewItem.Status.COMPLETED, pokemonItem.status());
    assertTrue(pokemonItem.ready());
    assertEquals("2026-11-02T08:00:02.000Z", pokemonItem.lastSyncAt());
    assertEquals("2026-11-02T08:00:00.000Z", pokemonItem.lastAttemptAt());
    assertEquals("2026-11-02T08:00:02.000Z", pokemonItem.lastFullSyncAt());
    assertEquals(2_000, pokemonItem.durationMs());
    assertEquals(List.of(9, 1, 2, 6, 1_025), List.of(pokemonItem.recordsProcessed(), pokemonItem.inserted(),
        pokemonItem.updated(), pokemonItem.skipped(), pokemonItem.recordsAvailable()));
    assertNull(pokemonItem.error());
    var tcgItem = items.getLast();
    assertEquals(SyncOverviewItem.Status.FAILED, tcgItem.status());
    assertFalse(tcgItem.ready());
    assertEquals("TCGdex returned HTTP 500", tcgItem.error());

    // Un origen listo cuyo último intento falló sigue en FAILED; uno en curso está en RUNNING.
    pokemon.blocking();
    var running = service.start(DataSyncSource.POKEAPI, DataSyncMode.INCREMENTAL);
    assertTrue(pokemon.entered.await(10, TimeUnit.SECONDS));
    assertEquals(SyncOverviewItem.Status.RUNNING, service.overview().getFirst().status());
    pokemon.release.countDown();
    await(running);
  }

  @Test
  void overviewUsesTheStateErrorWhenTheRunHasNone() throws Exception {
    execute("INSERT INTO \"DataSyncState\" (\"source\", \"recordsAvailable\", \"lastError\", \"updatedAt\")"
        + " VALUES ('TCGDEX', 12, 'error previo', ?)", Timestamp.valueOf("2026-11-01 10:00:00"));
    var item = service().overview().getLast();
    assertEquals(SyncOverviewItem.Status.COMPLETED, item.status());
    assertTrue(item.ready());
    assertEquals(12, item.recordsAvailable());
    assertEquals("error previo", item.error());
  }
}

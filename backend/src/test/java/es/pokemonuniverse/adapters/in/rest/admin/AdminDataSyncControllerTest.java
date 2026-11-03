package es.pokemonuniverse.adapters.in.rest.admin;

import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.body;
import static es.pokemonuniverse.adapters.in.rest.admin.AdminTestSupport.json;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.auth.IdentityTokens;
import es.pokemonuniverse.application.datasync.DataSyncAdapter;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncRecords;
import es.pokemonuniverse.application.datasync.DataSyncService;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.SyncResult;
import es.pokemonuniverse.config.DataSyncBeans;
import es.pokemonuniverse.config.DataSyncStartup;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Property;
import io.micronaut.context.annotation.Replaces;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * {@code GET /data-sync} y {@code POST /data-sync/:source} con el data-sync activo. El servicio usa adaptadores falsos
 * que se quedan esperando hasta que la prueba los suelta (para ver el 409), registros en memoria (no ensucia la BD
 * compartida) y sin {@link DataSyncStartup} (nada se lanza al arrancar).
 */
@MicronautTest(transactional = false)
@Property(name = "spec.name", value = "AdminDataSyncControllerTest")
@Property(name = "pu.data-sync.enabled", value = "true")
class AdminDataSyncControllerTest {

  static final List<String> CALLS = Collections.synchronizedList(new ArrayList<>());
  static volatile CountDownLatch release = new CountDownLatch(0);

  /** Sustituye el arranque: con el data-sync activo no debe lanzar la sincronización inicial en la prueba. */
  @Singleton
  @Requires(property = "spec.name", value = "AdminDataSyncControllerTest")
  @Replaces(DataSyncStartup.class)
  static class NoStartup {}

  @Factory
  @Requires(property = "spec.name", value = "AdminDataSyncControllerTest")
  static class Beans {
    @Singleton
    @Replaces(bean = DataSyncService.class, factory = DataSyncBeans.class)
    DataSyncService dataSyncService() {
      return new DataSyncService(new MemoryRecords(), List.of(adapter(DataSyncSource.POKEAPI),
          adapter(DataSyncSource.TCGDEX)), null, System::currentTimeMillis,
          () -> Instant.parse("2026-11-04T05:00:00Z"), Executors.newVirtualThreadPerTaskExecutor());
    }

    private static DataSyncAdapter adapter(DataSyncSource source) {
      return new DataSyncAdapter() {
        @Override
        public DataSyncSource source() {
          return source;
        }

        @Override
        public SyncResult run(DataSyncMode mode) {
          CALLS.add(source + ":" + mode);
          try {
            release.await(10, TimeUnit.SECONDS);
          } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
          }
          return new SyncResult(0, 0, 0, 0);
        }

        @Override
        public long recordsAvailable() {
          return 0;
        }
      };
    }
  }

  /** Registros en memoria: solo lo que {@code overview()} lee. */
  static final class MemoryRecords implements DataSyncRecords {
    @Override
    public int failInterrupted(Instant now, String error) {
      return 0;
    }

    @Override
    public String createRun(DataSyncSource source, DataSyncMode mode, Instant startedAt) {
      return source + "-" + startedAt.toEpochMilli();
    }

    @Override
    public void markAttempt(DataSyncSource source, Instant attemptedAt) {}

    @Override
    public void complete(String runId, DataSyncSource source, DataSyncMode mode, Instant startedAt,
        Instant completedAt, int durationMs, SyncResult result, long recordsAvailable) {}

    @Override
    public void fail(String runId, DataSyncSource source, Instant startedAt, Instant completedAt, int durationMs,
        String error) {}

    @Override
    public void recordAvailable(DataSyncSource source, long recordsAvailable) {}

    @Override
    public List<StoredState> states() {
      return List.of();
    }

    @Override
    public List<StoredRun> recentRuns(int limit) {
      return List.of();
    }
  }

  @Inject @Client("/") HttpClient client;
  @Inject IdentityTokens tokens;
  @Inject ObjectMapper mapper;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;
  @Inject DataSyncService service;

  private AdminTestSupport support;
  private AdminTestSupport.Account admin;

  @BeforeEach
  void setUp() throws Exception {
    support = new AdminTestSupport(client, tokens, mapper, dataSource, resolver);
    admin = support.admin();
    CALLS.clear();
    release = new CountDownLatch(1);
  }

  @AfterEach
  void drain() throws Exception {
    release.countDown();
    for (int i = 0; i < 200 && service.isRunning(); i++) Thread.sleep(10);
  }

  private String post(String source, String body) {
    var res = support.send(json(HttpRequest.POST("/api/admin/data-sync/" + source, body)), admin.cookie());
    assertEquals(HttpStatus.ACCEPTED, res.getStatus());
    return res.body();
  }

  private void awaitCalls(int n) throws InterruptedException {
    for (int i = 0; i < 200 && CALLS.size() < n; i++) Thread.sleep(10);
  }

  @Test
  void overviewListsBothSources() {
    var body = support.get("/api/admin/data-sync", admin.cookie());
    assertTrue(body.startsWith("{\"sources\":[{\"source\":\"POKEAPI\",\"status\":\"NOT_READY\",\"ready\":false,"
        + "\"lastSyncAt\":null,"), body);
    assertTrue(body.contains("{\"source\":\"TCGDEX\","), body);
    assertTrue(body.contains("\"nextSyncAt\":\"2026-11-04T05:00:00.000Z\""), body);
  }

  @Test
  void startsEachSourceWithItsModeAndEchoesTheRequestedOne() throws Exception {
    assertEquals("{\"accepted\":true,\"source\":\"tcg\",\"mode\":\"INCREMENTAL\"}", post("tcg", ""));
    awaitCalls(1);
    assertEquals(List.of("TCGDEX:PRICE_REFRESH"), CALLS);
    assertEquals("{\"accepted\":true,\"source\":\"pokemon\",\"mode\":\"FULL\"}",
        post("pokemon", "{\"full\":true,\"confirmFull\":true}"));
    awaitCalls(2);
    assertEquals("POKEAPI:FULL", CALLS.get(1));
  }

  @Test
  void aRunningSourceIs409ButAllSwallowsTheConflict() throws Exception {
    post("pokemon", "{}");
    awaitCalls(1);
    var conflict = support.fails(json(HttpRequest.POST("/api/admin/data-sync/pokemon", "{}")), admin.cookie());
    assertEquals(HttpStatus.CONFLICT, conflict.getStatus());
    assertEquals("{\"error\":\"POKEAPI ya se está sincronizando\"}", body(conflict));
    assertEquals("{\"accepted\":true,\"source\":\"all\",\"mode\":\"INCREMENTAL\"}", post("all", "{}"));
    release.countDown();
    for (int i = 0; i < 200 && service.isRunning(); i++) Thread.sleep(10);
    release = new CountDownLatch(1);
    assertEquals("{\"accepted\":true,\"source\":\"all\",\"mode\":\"FULL\"}",
        post("all", "{\"full\":true,\"confirmFull\":true}"));
    awaitCalls(3);
    assertEquals(List.of("POKEAPI:FULL", "TCGDEX:FULL"), CALLS.subList(1, 3).stream().sorted().toList());
  }

  @Test
  void validationOrderMatchesNode() {
    var full = support.fails(json(HttpRequest.POST("/api/admin/data-sync/pokemon", "{\"full\":true}")),
        admin.cookie());
    assertEquals(HttpStatus.BAD_REQUEST, full.getStatus());
    assertEquals("{\"error\":\"El Full Sync requiere confirmación explícita\"}", body(full));

    var source = support.fails(json(HttpRequest.POST("/api/admin/data-sync/bogus", "{\"full\":\"x\"}")),
        admin.cookie());
    assertEquals("{\"error\":\"Invalid option: expected one of \\\"pokemon\\\"|\\\"tcg\\\"|\\\"all\\\"\",\"issues\":"
        + "[{\"code\":\"invalid_value\",\"values\":[\"pokemon\",\"tcg\",\"all\"],\"path\":[],\"message\":\"Invalid "
        + "option: expected one of \\\"pokemon\\\"|\\\"tcg\\\"|\\\"all\\\"\"}]}", body(source));

    var types = support.fails(json(HttpRequest.POST("/api/admin/data-sync/tcg",
        "{\"full\":\"true\",\"confirmFull\":1,\"extra\":1}")), admin.cookie());
    assertEquals("{\"error\":\"Invalid input: expected boolean, received string\",\"issues\":[{\"expected\":"
        + "\"boolean\",\"code\":\"invalid_type\",\"path\":[\"full\"],\"message\":\"Invalid input: expected boolean, "
        + "received string\"},{\"expected\":\"boolean\",\"code\":\"invalid_type\",\"path\":[\"confirmFull\"],"
        + "\"message\":\"Invalid input: expected boolean, received number\"}]}", body(types));

    var array = support.fails(json(HttpRequest.POST("/api/admin/data-sync/tcg", "[]")), admin.cookie());
    assertEquals("{\"error\":\"Invalid input: expected object, received array\",\"issues\":[{\"expected\":\"object\","
        + "\"code\":\"invalid_type\",\"path\":[],\"message\":\"Invalid input: expected object, received array\"}]}",
        body(array));
    assertTrue(CALLS.isEmpty());
  }
}

package es.pokemonuniverse.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.datasync.DataSyncAdapter;
import es.pokemonuniverse.application.datasync.DataSyncMode;
import es.pokemonuniverse.application.datasync.DataSyncRecords;
import es.pokemonuniverse.application.datasync.DataSyncScheduler;
import es.pokemonuniverse.application.datasync.DataSyncService;
import es.pokemonuniverse.application.datasync.DataSyncSource;
import es.pokemonuniverse.application.datasync.SyncResult;
import io.micronaut.context.BeanContext;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Secuencia de arranque del data-sync ({@code index.ts}): con {@code pu.data-sync.enabled=false} no hace nada. */
@MicronautTest(transactional = false)
class DataSyncStartupTest {

  @Inject BeanContext context;
  @Inject DataSyncRecords records;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;

  private final List<String> calls = Collections.synchronizedList(new ArrayList<>());
  private final List<Long> timers = Collections.synchronizedList(new ArrayList<>());

  private DataSyncAdapter adapter(DataSyncSource source, long available) {
    return new DataSyncAdapter() {
      @Override
      public DataSyncSource source() {
        return source;
      }

      @Override
      public SyncResult run(DataSyncMode mode) {
        calls.add(source + ":" + mode);
        return new SyncResult(0, 0, 0, 0);
      }

      @Override
      public long recordsAvailable() {
        return available;
      }
    };
  }

  private DataSyncService service() {
    return new DataSyncService(records, List.of(adapter(DataSyncSource.POKEAPI, 0), adapter(DataSyncSource.TCGDEX, 0)),
        null, System::currentTimeMillis, Instant::now, Executors.newVirtualThreadPerTaskExecutor());
  }

  private DataSyncScheduler scheduler() {
    return new DataSyncScheduler(() -> CompletableFuture.completedFuture(null), System::currentTimeMillis,
        (task, delay) -> {
          timers.add(delay);
          return () -> {};
        }, 6, 0, ZoneId.of("Europe/Madrid"));
  }

  private void execute(String sql, Object... params) throws SQLException {
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement(sql)) {
      for (int i = 0; i < params.length; i++) statement.setObject(i + 1, params[i]);
      statement.executeUpdate();
    }
  }

  private String status(String id) throws SQLException {
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement("SELECT \"status\"::text FROM \"DataSyncRun\" WHERE \"id\" = ?")) {
      statement.setString(1, id);
      try (var set = statement.executeQuery()) {
        set.next();
        return set.getString(1);
      }
    }
  }

  @BeforeEach
  void clean() throws SQLException {
    execute("DELETE FROM \"DataSyncRun\"");
    execute("DELETE FROM \"DataSyncState\"");
    execute("INSERT INTO \"DataSyncRun\" (\"id\", \"source\", \"mode\", \"status\", \"createdAt\")"
        + " VALUES ('live', 'POKEAPI', 'FULL', 'RUNNING', ?)", Timestamp.from(Instant.now()));
  }

  @Test
  void theApplicationContextHasTheServiceButStartsNothingByDefault() {
    assertTrue(context.findBean(DataSyncService.class).isPresent());
    assertTrue(context.findBean(DataSyncStartup.class).isPresent());
    assertFalse(context.getBean(DataSyncScheduler.class).running());
    assertFalse(context.getBean(DataSyncService.class).isRunning());
  }

  /** Otro proceso (Node) puede estar sincronizando la misma BD: ni se toca su ejecución ni se programa nada. */
  @Test
  void disabledStartupLeavesForeignRunsAndSchedulesNothing() throws Exception {
    var scheduler = scheduler();
    var service = service();
    new DataSyncStartup(service, scheduler, false).start();
    assertEquals("RUNNING", status("live"));
    assertFalse(scheduler.running());
    assertTrue(timers.isEmpty());
    assertTrue(calls.isEmpty());
  }

  @Test
  void enabledStartupRecoversSyncsPokemonArmsTheSchedulerAndStartsTheTcgInitialSync() throws Exception {
    var scheduler = scheduler();
    var service = service();
    var startup = new DataSyncStartup(service, scheduler, true);
    startup.start();
    assertEquals("FAILED", status("live"));
    assertEquals("POKEAPI:INITIAL", calls.getFirst());
    assertTrue(scheduler.running());
    assertEquals(1, timers.size());
    // La inicial de TCG va en segundo plano: se espera a que empiece antes de apagar (si no, stop() la descarta).
    var deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(10);
    while (calls.size() < 2 && System.nanoTime() < deadline) Thread.sleep(10);
    startup.stop();
    assertFalse(scheduler.running());
    assertEquals(List.of("POKEAPI:INITIAL", "TCGDEX:INITIAL"), calls);
  }
}

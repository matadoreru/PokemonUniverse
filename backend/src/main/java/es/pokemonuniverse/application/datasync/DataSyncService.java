package es.pokemonuniverse.application.datasync;

import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.core.annotation.Nullable;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code DataSyncService} de {@code service.ts}. {@link #start} comprueba y registra el origen activo de forma atómica
 * y ejecuta la sincronización en un hilo virtual; cada ejecución queda registrada en {@code "DataSyncRun"} y su
 * resultado en {@code "DataSyncState"}. Los oyentes de {@link #onCompleted} corren en orden dentro de la ejecución y
 * sus errores se registran y se ignoran. {@link #stop()} rechaza nuevas ejecuciones y espera a las activas.
 */
public class DataSyncService {

  private static final Logger LOG = LoggerFactory.getLogger(DataSyncService.class);
  private static final List<DataSyncSource> SOURCES = List.of(DataSyncSource.POKEAPI, DataSyncSource.TCGDEX);
  static final String STOPPING = "El servidor se está cerrando";
  static final String INTERRUPTED = "Servidor reiniciado durante la sincronización";
  static final String ALL_RUNNING = "Ya hay una sincronización activa";
  /** {@code available >= 1_025} de {@code ensureInitialPokemon}: el catálogo nacional completo. */
  private static final long FULL_POKEDEX = 1_025;
  private static final int OVERVIEW_RUNS = 20;

  private final DataSyncRecords records;
  private final Map<DataSyncSource, DataSyncAdapter> adapters = new EnumMap<>(DataSyncSource.class);
  private final @Nullable PokemonPaletteCount palettes;
  private final Clock clock;
  private final Supplier<Instant> nextSync;
  private final ExecutorService executor;
  private final Object lock = new Object();
  private final Map<DataSyncSource, CompletableFuture<SyncResult>> active = new EnumMap<>(DataSyncSource.class);
  private final CopyOnWriteArraySet<Consumer<DataSyncSource>> listeners = new CopyOnWriteArraySet<>();
  private boolean stopping;
  private @Nullable CompletableFuture<?> initialTask;

  public DataSyncService(DataSyncRecords records, List<DataSyncAdapter> adapters,
      @Nullable PokemonPaletteCount palettes, Clock clock, Supplier<Instant> nextSync, ExecutorService executor) {
    this.records = records;
    for (var adapter : adapters) this.adapters.put(adapter.source(), adapter);
    this.palettes = palettes;
    this.clock = clock;
    this.nextSync = nextSync;
    this.executor = executor;
  }

  /** Las ejecuciones PENDING o RUNNING de un proceso anterior pasan a FAILED. */
  public void recoverInterrupted() {
    records.failInterrupted(now(), INTERRUPTED);
  }

  public boolean isRunning() {
    synchronized (lock) {
      return !active.isEmpty();
    }
  }

  public boolean isRunning(DataSyncSource source) {
    synchronized (lock) {
      return active.containsKey(source);
    }
  }

  /** Suscribe un oyente de fin de sincronización correcta; devuelve la acción que lo da de baja. */
  public Runnable onCompleted(Consumer<DataSyncSource> listener) {
    listeners.add(listener);
    return () -> listeners.remove(listener);
  }

  /**
   * Lanza la sincronización de un origen. Síncrono: lanza {@link SyncAlreadyRunningException} (409) si el origen ya
   * está activo e {@link IllegalStateException} (500) durante el apagado. El futuro termina con el resultado o el
   * error de la ejecución; el origen deja de estar activo antes de completarlo.
   */
  public CompletableFuture<SyncResult> start(DataSyncSource source, DataSyncMode mode) {
    synchronized (lock) {
      if (stopping) throw new IllegalStateException(STOPPING);
      if (active.containsKey(source)) throw new SyncAlreadyRunningException(source + " ya se está sincronizando");
      var future = new CompletableFuture<SyncResult>();
      active.put(source, future);
      try {
        executor.execute(() -> run(source, mode, future));
      } catch (RuntimeException e) {
        active.remove(source, future);
        throw e;
      }
      return future;
    }
  }

  /**
   * Sincroniza los dos orígenes en paralelo (TCGDEX en INCREMENTAL pasa a PRICE_REFRESH). Asíncrono como en Node:
   * con cualquier origen activo, o durante el apagado, el futuro falla en lugar de lanzar. Falla con el primer error.
   */
  public CompletableFuture<List<SyncResult>> startAll(DataSyncMode mode) {
    var tasks = new ArrayList<CompletableFuture<SyncResult>>();
    synchronized (lock) {
      if (!active.isEmpty()) return CompletableFuture.failedFuture(new SyncAlreadyRunningException(ALL_RUNNING));
      try {
        for (var source : SOURCES) {
          tasks.add(start(source,
              source == DataSyncSource.TCGDEX && mode == DataSyncMode.INCREMENTAL ? DataSyncMode.PRICE_REFRESH : mode));
        }
      } catch (RuntimeException e) {
        return CompletableFuture.failedFuture(e);
      }
    }
    var all = new CompletableFuture<List<SyncResult>>();
    for (var task : tasks) {
      task.whenComplete((ignored, error) -> {
        if (error != null) all.completeExceptionally(unwrap(error));
      });
    }
    CompletableFuture.allOf(tasks.toArray(CompletableFuture[]::new))
        .thenRun(() -> all.complete(tasks.stream().map(CompletableFuture::join).toList()));
    return all;
  }

  /**
   * Arranque con el data-sync activo: con el catálogo completo ({@code >= 1025}) y paletas suficientes solo actualiza
   * {@code recordsAvailable}; si no, ejecuta y espera la sincronización inicial de Pokémon (sus errores se propagan).
   */
  public void ensureInitialPokemon() {
    var adapter = requireAdapter(DataSyncSource.POKEAPI);
    var available = adapter.recordsAvailable();
    var persisted = available >= FULL_POKEDEX && palettes != null ? palettes.persisted() : 0;
    if (available >= FULL_POKEDEX && persisted >= PokemonPaletteCount.MIN_PLAYABLE) {
      records.recordAvailable(DataSyncSource.POKEAPI, available);
      return;
    }
    try {
      start(DataSyncSource.POKEAPI, DataSyncMode.INITIAL).get();
    } catch (ExecutionException e) {
      throw propagate(e.getCause());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }

  /** Sin cartas TCG lanza la sincronización inicial en segundo plano; con cartas solo actualiza el estado. */
  public void startInitialTcgInBackground() {
    var adapter = requireAdapter(DataSyncSource.TCGDEX);
    var task = CompletableFuture.runAsync(() -> {
      var count = adapter.recordsAvailable();
      CompletableFuture<SyncResult> initial = null;
      // Comprobación del apagado y arranque atómicos: un stop() intermedio no se registra como fallo de TCG.
      synchronized (lock) {
        if (stopping) return;
        if (count == 0) initial = start(DataSyncSource.TCGDEX, DataSyncMode.INITIAL);
      }
      if (initial != null) {
        initial.join();
        return;
      }
      records.recordAvailable(DataSyncSource.TCGDEX, count);
    }, executor).exceptionally(error -> {
      LOG.error("[DataSync] TCGdex initial sync failed:", unwrap(error));
      return null;
    });
    synchronized (lock) {
      initialTask = task;
    }
  }

  /** Rechaza nuevas ejecuciones, espera a la tarea inicial de TCG y después a todas las activas. Idempotente. */
  public void stop() {
    CompletableFuture<?> initial;
    synchronized (lock) {
      stopping = true;
      initial = initialTask;
    }
    if (initial != null) awaitQuietly(initial);
    List<CompletableFuture<SyncResult>> running;
    synchronized (lock) {
      running = List.copyOf(active.values());
    }
    running.forEach(DataSyncService::awaitQuietly);
    executor.shutdown();
  }

  /** Estado de [POKEAPI, TCGDEX] para la administración. */
  public List<SyncOverviewItem> overview() {
    var states = records.states();
    var runs = records.recentRuns(OVERVIEW_RUNS);
    var next = IsoTimestamps.millis(nextSync.get());
    return SOURCES.stream().map(source -> {
      var state = states.stream().filter(item -> item.source() == source).findFirst().orElse(null);
      var run = runs.stream().filter(item -> item.source() == source).findFirst().orElse(null);
      var running = isRunning(source) || run != null && run.status() == DataSyncStatus.RUNNING;
      var available = state == null ? 0 : state.recordsAvailable();
      var ready = available > 0;
      var status = running ? SyncOverviewItem.Status.RUNNING
          : run != null && run.status() == DataSyncStatus.FAILED ? SyncOverviewItem.Status.FAILED
          : ready ? SyncOverviewItem.Status.COMPLETED
          : SyncOverviewItem.Status.NOT_READY;
      var error = run != null && run.error() != null ? run.error() : state == null ? null : state.lastError();
      return new SyncOverviewItem(source, status, ready,
          iso(state == null ? null : state.lastSuccessAt()),
          iso(state == null ? null : state.lastAttemptAt()),
          iso(state == null ? null : state.lastFullSyncAt()),
          run == null ? null : run.durationMs(),
          run == null ? 0 : run.recordsProcessed(),
          run == null ? 0 : run.inserted(),
          run == null ? 0 : run.updated(),
          run == null ? 0 : run.skipped(),
          available, error, next);
    }).toList();
  }

  private void run(DataSyncSource source, DataSyncMode mode, CompletableFuture<SyncResult> future) {
    SyncResult result = null;
    Throwable failure = null;
    try {
      result = execute(source, mode);
    } catch (Throwable error) {
      failure = error;
    }
    // Como el finally de Node: el origen deja de estar activo antes de que nadie vea el resultado.
    synchronized (lock) {
      active.remove(source, future);
    }
    if (failure != null) future.completeExceptionally(failure);
    else future.complete(result);
  }

  private SyncResult execute(DataSyncSource source, DataSyncMode mode) {
    var adapter = requireAdapter(source);
    var startedAt = now();
    var runId = records.createRun(source, mode, startedAt);
    LOG.info("[DataSync] sync started source={} mode={}", source, mode);
    // Desde aquí la fila existe en RUNNING: cualquier fallo (también al registrar el intento) la cierra en FAILED.
    try {
      records.markAttempt(source, startedAt);
      var result = adapter.run(mode);
      var completedAt = now();
      var durationMs = duration(startedAt, completedAt);
      var available = adapter.recordsAvailable();
      records.complete(runId, source, mode, startedAt, completedAt, durationMs, result, available);
      LOG.info("[DataSync] sync completed source={} inserted={} updated={} skipped={} durationMs={}", source,
          result.inserted(), result.updated(), result.skipped(), durationMs);
      notifyCompleted(source);
      return result;
    } catch (Throwable error) {
      var completedAt = now();
      var durationMs = duration(startedAt, completedAt);
      var message = error.getMessage() != null ? error.getMessage() : error.toString();
      LOG.error("[DataSync] sync failed source={} durationMs={} error={}", source, durationMs, message);
      try {
        records.fail(runId, source, startedAt, completedAt, durationMs, message);
      } catch (Throwable persistence) {
        // Se conserva el error original; el de persistencia viaja como suprimido.
        error.addSuppressed(persistence);
      }
      throw error;
    }
  }

  /**
   * Oyentes en orden; sus errores se registran y se ignoran, como en Node (la ejecución ya está COMPLETED). Solo
   * escapan los errores de la máquina virtual (memoria agotada, pila desbordada...).
   */
  private void notifyCompleted(DataSyncSource source) {
    for (var listener : listeners) {
      try {
        listener.accept(source);
      } catch (VirtualMachineError fatal) {
        throw fatal;
      } catch (Exception | Error e) {
        LOG.error("[DataSync] post-sync refresh failed source={}", source, e);
      }
    }
  }

  private DataSyncAdapter requireAdapter(DataSyncSource source) {
    var adapter = adapters.get(source);
    if (adapter == null) throw new IllegalStateException("No sync adapter registered for " + source);
    return adapter;
  }

  private Instant now() {
    return Instant.ofEpochMilli(clock.now());
  }

  private static int duration(Instant startedAt, Instant completedAt) {
    return Math.toIntExact(completedAt.toEpochMilli() - startedAt.toEpochMilli());
  }

  private static @Nullable String iso(@Nullable Instant instant) {
    return instant == null ? null : IsoTimestamps.millis(instant);
  }

  private static void awaitQuietly(CompletableFuture<?> future) {
    try {
      future.join();
    } catch (RuntimeException ignored) {
      // allSettled: el error ya se registró en la propia ejecución.
    }
  }

  private static Throwable unwrap(Throwable error) {
    return error instanceof CompletionException && error.getCause() != null ? error.getCause() : error;
  }

  private static RuntimeException propagate(Throwable error) {
    if (error instanceof RuntimeException runtime) return runtime;
    if (error instanceof Error fatal) throw fatal;
    return new IllegalStateException(error);
  }
}

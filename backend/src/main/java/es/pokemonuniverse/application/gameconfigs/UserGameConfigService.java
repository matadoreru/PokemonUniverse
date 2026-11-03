package es.pokemonuniverse.application.gameconfigs;

import es.pokemonuniverse.application.rooms.RoomSchedulers;
import es.pokemonuniverse.application.rooms.UserGameConfigPreferences;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.context.annotation.Requires;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Configuraciones de juego por usuario ({@code UserGameConfigService} de {@code game-configs/service.ts}). La caché
 * guarda por usuario un mapa inmutable que cada {@link #save} sustituye (el coordinador lo lee bajo el lock de una
 * sala mientras otras guardan). Cada {@code save} actualiza la caché al momento y programa la escritura con un debounce
 * de {@value #DEBOUNCE_MS} ms por (usuario, juego); gana el último valor, las escrituras de una misma clave se
 * encadenan en orden y un fallo se registra ({@code Failed to persist game config for <juego>}) sin reintento.
 * {@link #flush()} cancela los plazos, escribe lo pendiente y espera lo que esté en curso.
 */
@Singleton
@Requires(beans = UserGameConfigStore.class)
public class UserGameConfigService implements UserGameConfigPreferences {

  static final long DEBOUNCE_MS = 250;
  private static final Logger LOG = LoggerFactory.getLogger(UserGameConfigService.class);
  private static final long SHUTDOWN_TIMEOUT_SECONDS = 10;

  private record Key(String userId, String gameId) {}

  private record PendingWrite(String userId, String gameId, JsonNode config) {}

  /** Plazo programado; el callback comprueba que sigue siendo el vigente de su clave. */
  private static final class Timer {
    Runnable cancel = () -> {};
  }

  private final UserGameConfigStore store;
  private final GameRegistry registry;
  private final RoomSchedulers schedulers;
  private final JsonMapper json;
  private final Executor writer;
  private final StoredGameConfigMigration migration;
  private final Map<String, Map<String, JsonNode>> byUser = new ConcurrentHashMap<>();
  private final Object lock = new Object();
  private final Map<Key, PendingWrite> pending = new HashMap<>();
  private final Map<Key, Timer> timers = new HashMap<>();
  private final Map<Key, CompletableFuture<Void>> writes = new HashMap<>();
  private boolean closed;

  @Inject
  public UserGameConfigService(UserGameConfigStore store, GameRegistry registry, RoomSchedulers schedulers,
      JsonMapper json) {
    this(store, registry, schedulers, json,
        Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("game-config-writes-", 0).factory()));
  }

  /** {@code writer} ejecuta las escrituras a la BD (las pruebas las retienen o las ejecutan en el acto). */
  public UserGameConfigService(UserGameConfigStore store, GameRegistry registry, RoomSchedulers schedulers,
      JsonMapper json, Executor writer) {
    this.store = store;
    this.registry = registry;
    this.schedulers = schedulers;
    this.json = json;
    this.writer = writer;
    this.migration = new StoredGameConfigMigration(json);
  }

  /**
   * Arranque: migra cada fila de un juego registrado y la cachea; las de juegos desconocidos se saltan sin tocarlas.
   * Las filas cuya migración cambia algo se reescriben antes de volver (un fallo aborta el arranque, como en Node).
   */
  public void load() {
    var migrations = new ArrayList<PendingWrite>();
    for (var row : store.list()) {
      var engine = engine(row.gameId());
      if (engine.isEmpty()) continue;
      var config = migration.migrate(engine.get(), row.config());
      synchronized (lock) {
        // Mismo lock que save(): la caché solo se modifica bajo él.
        cache(row.userId(), row.gameId(), config);
      }
      if (!JsonTree.equal(config, row.config())) migrations.add(new PendingWrite(row.userId(), row.gameId(), config));
    }
    for (var entry : migrations) store.upsert(entry.userId(), entry.gameId(), entry.config());
  }

  @Override
  public Map<String, JsonNode> forUser(String userId) {
    return byUser.getOrDefault(userId, Map.of());
  }

  /** Juego desconocido: se ignora. Configuración no válida: lanza la excepción del motor sin tocar nada. */
  @Override
  public void save(String userId, String gameId, JsonNode config) {
    var engine = engine(gameId);
    if (engine.isEmpty()) return;
    var parsed = toTree(engine.get().parseConfig(config));
    var key = new Key(userId, gameId);
    synchronized (lock) {
      // Caché y escritura pendiente en el mismo lock: dos save simultáneos dejan el mismo ganador en ambas.
      cache(userId, gameId, parsed);
      pending.put(key, new PendingWrite(userId, gameId, parsed));
      var prior = timers.remove(key);
      if (prior != null) prior.cancel.run();
      if (closed) {
        // Tras el apagado no queda planificador: se escribe ya.
        persist(key);
        return;
      }
      var timer = new Timer();
      timers.put(key, timer);
      timer.cancel = schedulers.schedule(DEBOUNCE_MS, () -> {
        synchronized (lock) {
          if (timers.get(key) != timer) return;
          timers.remove(key);
          persist(key);
        }
      });
    }
  }

  /** Apagado: cancela los plazos, escribe todo lo pendiente y espera las escrituras en curso. */
  public void flush() {
    awaitWrites().join();
  }

  /** {@code @PreDestroy}: como {@link #flush()}, con tope de espera; lo que llegue después se escribe al momento. */
  @PreDestroy
  void close() {
    synchronized (lock) {
      closed = true;
    }
    try {
      awaitWrites().get(SHUTDOWN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
    } catch (TimeoutException e) {
      LOG.warn("Quedan configuraciones de juego sin persistir al cerrar");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    } catch (Exception e) {
      LOG.warn("Fallo al persistir las configuraciones de juego al cerrar", e);
    }
    if (writer instanceof ExecutorService service) service.shutdown();
  }

  private CompletableFuture<Void> awaitWrites() {
    List<CompletableFuture<Void>> inFlight;
    synchronized (lock) {
      for (var timer : timers.values()) timer.cancel.run();
      timers.clear();
      for (var key : List.copyOf(pending.keySet())) persist(key);
      inFlight = List.copyOf(writes.values());
    }
    return CompletableFuture.allOf(inFlight.toArray(CompletableFuture[]::new));
  }

  /**
   * Encadena la escritura pendiente de {@code key} tras la anterior en curso; al terminar, si llegó otra pendiente
   * mientras tanto, la escribe. Siempre bajo {@link #lock}; la escritura corre en {@link #writer}; la última de
   * cada clave en {@link #writes} termina después de todas las anteriores, así que esperar esas basta.
   */
  private void persist(Key key) {
    var next = pending.remove(key);
    if (next == null) return;
    var prior = writes.getOrDefault(key, CompletableFuture.completedFuture(null));
    var write = new CompletableFuture<Void>();
    writes.put(key, write);
    // Tras close() el ejecutor ya no acepta tareas: lo que llegue tarde se escribe en el hilo que la completa.
    Executor executor = closed ? Runnable::run : writer;
    prior.thenRunAsync(() -> store.upsert(next.userId(), next.gameId(), next.config()), executor)
        .whenComplete((ignored, error) -> {
          if (error != null) LOG.error("Failed to persist game config for " + next.gameId(), error);
          synchronized (lock) {
            if (writes.get(key) == write) {
              writes.remove(key);
              if (pending.containsKey(key)) persist(key);
            }
          }
          write.complete(null);
        });
  }

  private Optional<GameEngine<?, ?, ?, ?>> engine(String gameId) {
    if (registry.get(gameId).isEmpty()) return Optional.empty();
    return registry.engine(gameId);
  }

  private void cache(String userId, String gameId, JsonNode config) {
    byUser.compute(userId, (ignored, prior) -> {
      var next = new LinkedHashMap<String, JsonNode>(prior == null ? Map.of() : prior);
      next.put(gameId, config);
      return Collections.unmodifiableMap(next);
    });
  }

  private JsonNode toTree(Object value) {
    try {
      return json.writeValueToTree(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

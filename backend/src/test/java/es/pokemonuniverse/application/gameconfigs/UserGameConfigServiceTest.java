package es.pokemonuniverse.application.gameconfigs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.resources.ClasspathGameRegistryLoader;
import es.pokemonuniverse.application.rooms.RoomSchedulers;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.json.JsonTree;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import org.junit.jupiter.api.Test;

/**
 * {@code game-configs/service.test.ts}: caché inmediata, debounce de 250 ms por (usuario, juego) con planificador
 * manual, escrituras encadenadas por clave en un ejecutor que las suelta a mano, último valor gana, fallo sin
 * reintento y {@code flush()} del apagado.
 */
class UserGameConfigServiceTest {

  private static final ObjectMapper MAPPER = ObjectMapper.getDefault();
  private static final GameRegistry REGISTRY = ClasspathGameRegistryLoader.loadFromClasspath(MAPPER);

  /** Planificador falso: {@link #advance} dispara en orden los plazos vencidos. */
  private static final class ManualScheduler implements RoomSchedulers {
    private record Timer(long dueAt, Runnable task, boolean[] cancelled) {}

    private long now;
    private final List<Timer> timers = new ArrayList<>();

    @Override
    public Runnable schedule(long delayMs, Runnable task) {
      var timer = new Timer(now + delayMs, task, new boolean[1]);
      timers.add(timer);
      return () -> timer.cancelled()[0] = true;
    }

    void advance(long ms) {
      now += ms;
      for (var timer : List.copyOf(timers)) {
        if (timer.dueAt() <= now) {
          timers.remove(timer);
          if (!timer.cancelled()[0]) timer.task().run();
        }
      }
    }

    long live() {
      return timers.stream().filter(timer -> !timer.cancelled()[0]).count();
    }
  }

  /** Ejecutor que retiene las escrituras hasta {@link #runAll}, para ver el encadenamiento. */
  private static final class HeldExecutor implements Executor {
    private final ArrayDeque<Runnable> queue = new ArrayDeque<>();
    boolean direct = true;

    @Override
    public void execute(Runnable command) {
      if (direct) command.run();
      else queue.add(command);
    }

    void runAll() {
      while (!queue.isEmpty()) queue.poll().run();
    }
  }

  private static final class MemoryStore implements UserGameConfigStore {
    final List<StoredUserGameConfig> rows = new ArrayList<>();
    final List<String> writes = new ArrayList<>();
    int failures;

    @Override
    public List<StoredUserGameConfig> list() {
      return List.copyOf(rows);
    }

    @Override
    public void upsert(String userId, String gameId, JsonNode config) {
      if (failures > 0) {
        failures--;
        throw new IllegalStateException("BD caída");
      }
      writes.add(userId + ":" + gameId + ":" + config.get("rounds").getIntValue());
    }
  }

  private final ManualScheduler scheduler = new ManualScheduler();
  private final HeldExecutor executor = new HeldExecutor();
  private final MemoryStore store = new MemoryStore();
  private final UserGameConfigService service =
      new UserGameConfigService(store, REGISTRY, scheduler, MAPPER, executor);

  private static JsonNode json(String text) {
    try {
      return MAPPER.readValue(text, JsonNode.class);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static JsonNode higherLower(int rounds) {
    return json("""
        {"generations":[2,1],"categories":["HP"],"showPreviousValue":true,"answerVisibility":"REALTIME",
         "difficulty":"NORMAL","roundSeconds":20,"rounds":%d}""".formatted(rounds));
  }

  @Test
  void debouncesThreeSavesWithinTheWindowIntoOneWriteOfTheLastValue() {
    service.save("u1", "higher-lower", higherLower(3));
    scheduler.advance(50);
    service.save("u1", "higher-lower", higherLower(4));
    scheduler.advance(50);
    service.save("u1", "higher-lower", higherLower(5));
    // La caché se actualiza al momento, ya normalizada (generations ordenadas).
    var cached = service.forUser("u1").get("higher-lower");
    assertEquals(5, cached.get("rounds").getIntValue());
    assertEquals("[1,2]", JsonTree.toCanonicalString(cached.get("generations")));
    scheduler.advance(249);
    assertEquals(List.of(), store.writes);
    scheduler.advance(1);
    assertEquals(List.of("u1:higher-lower:5"), store.writes);
    assertEquals(0, scheduler.live());
  }

  @Test
  void keysAreDebouncedSeparately() {
    service.save("u1", "higher-lower", higherLower(3));
    service.save("u2", "higher-lower", higherLower(4));
    scheduler.advance(250);
    assertEquals(List.of("u1:higher-lower:3", "u2:higher-lower:4"), store.writes);
    assertEquals(Map.of(), service.forUser("nadie"));
  }

  @Test
  void flushPersistsPendingWritesAndCancelsTheTimers() {
    service.save("u1", "higher-lower", higherLower(7));
    service.flush();
    assertEquals(List.of("u1:higher-lower:7"), store.writes);
    assertEquals(0, scheduler.live());
    scheduler.advance(1_000);
    assertEquals(List.of("u1:higher-lower:7"), store.writes);
  }

  @Test
  void savesAfterAFlushAreStillDebounced() {
    service.flush();
    service.save("u1", "higher-lower", higherLower(8));
    assertEquals(List.of(), store.writes);
    scheduler.advance(250);
    assertEquals(List.of("u1:higher-lower:8"), store.writes);
  }

  /** Única espera real (200 ms): comprobar que {@code flush()} sigue bloqueado mientras la escritura está retenida. */
  @Test
  void flushWaitsForWritesAlreadyInFlight() throws Exception {
    executor.direct = false;
    service.save("u1", "higher-lower", higherLower(2));
    scheduler.advance(250);
    var flushing = Thread.ofVirtual().start(service::flush);
    flushing.join(200);
    assertTrue(flushing.isAlive());
    executor.runAll();
    flushing.join(5_000);
    assertEquals(List.of("u1:higher-lower:2"), store.writes);
  }

  @Test
  void writesOfTheSameKeyAreChainedInOrder() {
    executor.direct = false;
    service.save("u1", "higher-lower", higherLower(2));
    scheduler.advance(250);
    service.save("u1", "higher-lower", higherLower(3));
    scheduler.advance(250);
    assertEquals(List.of(), store.writes);
    executor.runAll();
    assertEquals(List.of("u1:higher-lower:2", "u1:higher-lower:3"), store.writes);
  }

  @Test
  void aFailedWriteIsNotRetriedAndLaterWritesStillHappen() {
    store.failures = 1;
    service.save("u1", "higher-lower", higherLower(2));
    scheduler.advance(250);
    assertEquals(List.of(), store.writes);
    scheduler.advance(10_000);
    assertEquals(List.of(), store.writes);
    service.save("u1", "higher-lower", higherLower(3));
    scheduler.advance(250);
    assertEquals(List.of("u1:higher-lower:3"), store.writes);
  }

  @Test
  void unknownGamesAreIgnoredAndInvalidConfigsThrow() {
    service.save("u1", "no-existe", higherLower(2));
    assertEquals(Map.of(), service.forUser("u1"));
    assertEquals(0, scheduler.live());
    assertThrows(ConfigValidationException.class, () -> service.save("u1", "higher-lower", json("{\"rounds\":2}")));
    assertEquals(Map.of(), service.forUser("u1"));
    assertEquals(0, scheduler.live());
  }

  @Test
  void loadMigratesKnownRowsSkipsUnknownGamesAndRewritesOnlyChangedRows() {
    store.rows.add(new StoredUserGameConfig("u1", "higher-lower", higherLower(4)));
    store.rows.add(new StoredUserGameConfig("u1", "pokedex-distance",
        json("{\"roundSeconds\":25,\"generations\":[1]}")));
    store.rows.add(new StoredUserGameConfig("u2", "juego-retirado", json("{\"rounds\":1}")));
    store.rows.add(new StoredUserGameConfig("u2", "higher-lower", json("\"corrupto\"")));
    service.load();
    // generations [2,1] se normaliza y la fila corrupta cae al defecto: dos reescrituras; pokedex-distance no cambia
    // (el orden de claves de jsonb no cuenta).
    assertEquals(List.of("u1:higher-lower:4", "u2:higher-lower:10"), store.writes);
    assertEquals("[1,2]", JsonTree.toCanonicalString(service.forUser("u1").get("higher-lower").get("generations")));
    assertEquals(25, service.forUser("u1").get("pokedex-distance").get("roundSeconds").getIntValue());
    assertEquals(List.of("higher-lower"), List.copyOf(service.forUser("u2").keySet()));
  }

  @Test
  void savesAfterCloseAreWrittenAtOnce() {
    service.close();
    service.save("u1", "higher-lower", higherLower(6));
    assertEquals(List.of("u1:higher-lower:6"), store.writes);
    assertEquals(0, scheduler.live());
  }
}

package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.domain.room.ChatFilter;
import es.pokemonuniverse.domain.room.DailyRoom;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.RoomPhase;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.function.Function;

/**
 * Montaje de sala para los tests del reto diario fuera de este paquete: coordinador real con todos los motores
 * portados, catálogo dorado gen1-2, reloj y temporizadores manuales. Su {@code startDaily} puede fallar a propósito o
 * esperar a una señal, para probar la compensación y los arranques simultáneos.
 */
public final class DailyTestRooms {

  public static final ObjectMapper MAPPER = RoomTestKit.MAPPER;

  private final ManualTime time;
  private final RoomCoordinator manager;
  private final AtomicInteger failingStarts = new AtomicInteger();
  private final AtomicInteger lateFailingStarts = new AtomicInteger();
  private volatile @Nullable CountDownLatch startGate;

  /** {@code dailyRuns} recibe el reloj de la sala y devuelve quien registra sus partidas. */
  public DailyTestRooms(long startMs, Function<Clock, DailyRunListener> dailyRuns) {
    this.time = new ManualTime(startMs);
    this.manager = new RoomCoordinator(registry(), MAPPER, new RecordingEvents(), new RecordingAudit(),
        new RecordingPersister(), UserGameConfigPreferences.NO_OP, HostContentProvider.EMPTY, time,
        new SeededRandom(42), time, RoomTestKit.NO_INTRO, () -> GameCatalogs.of(RoomTestKit.CATALOG),
        RoomTestKit.ASSETS, null, UserExperienceReader.NONE, ChatFilter.NONE, RoomActivity.NONE,
        dailyRuns.apply(time)) {
      @Override
      public RoomView startDaily(AuthUser identity, String connectionId, DailyLaunch launch) {
        var gate = startGate;
        if (gate != null) {
          try {
            gate.await(10, TimeUnit.SECONDS);
          } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
          }
        }
        if (failingStarts.getAndUpdate(n -> Math.max(0, n - 1)) > 0) {
          throw new RoomException("Fallo de arranque de prueba");
        }
        var view = super.startDaily(identity, connectionId, launch);
        if (lateFailingStarts.getAndUpdate(n -> Math.max(0, n - 1)) > 0) {
          throw new RoomException("Fallo tardío de prueba");
        }
        return view;
      }
    };
  }

  /** Registro con todos los motores portados (el juego del día puede ser cualquiera de los cuatro). */
  public static GameRegistry registry() {
    return RoomTestKit.REAL_REGISTRY;
  }

  public static InMemoryPokemonCatalog goldenCatalog() {
    return RoomTestKit.CATALOG;
  }

  public RoomCoordinator manager() {
    return manager;
  }

  public Clock clock() {
    return time;
  }

  public void setTime(long epochMs) {
    time.set(epochMs);
  }

  public void advance(long ms) {
    time.advance(ms);
  }

  /** Los próximos {@code count} {@code startDaily} lanzan {@link RoomException} sin crear la sala. */
  public void failNextDailyStarts(int count) {
    failingStarts.set(count);
  }

  /** Los próximos {@code count} {@code startDaily} crean y arrancan la sala, y después lanzan {@link RoomException}. */
  public void failNextDailyStartsAfterLaunch(int count) {
    lateFailingStarts.set(count);
  }

  /** Cada {@code startDaily} espera (hasta 10 s) a que se abra {@code gate}. */
  public void holdDailyStartsUntil(@Nullable CountDownLatch gate) {
    startGate = gate;
  }

  /** {@code game:action} del jugador. */
  public void action(String userId, JsonNode action) {
    manager.action(userId, action);
  }

  public void replaceCatalog(PokemonCatalog pokemon) {
    manager.replaceCatalog(GameCatalogs.of(pokemon));
  }

  private @Nullable LiveRoom roomOf(String userId) {
    return manager.store.roomForPlayer(userId);
  }

  public @Nullable DailyRoom daily(String userId) {
    var room = roomOf(userId);
    return room == null ? null : room.daily;
  }

  public @Nullable Object gameState(String userId) {
    var room = roomOf(userId);
    return room == null || room.game == null ? null : room.game.state;
  }

  public boolean inGameResults(String userId) {
    var room = roomOf(userId);
    return room != null && room.phase == RoomPhase.GAME_RESULTS;
  }

  /** Deja vencer cada plazo hasta los resultados; {@code eachState} ve el estado del motor antes de cada plazo. */
  public void playByTimeouts(String userId, Consumer<Object> eachState) {
    var room = roomOf(userId);
    if (room == null) throw new IllegalStateException("sin sala del reto");
    for (int step = 0; step < 200 && room.phase != RoomPhase.GAME_RESULTS; step++) {
      eachState.accept(room.game.state);
      var deadline = room.game.engine.getLifecycle(room.game.state).nextDeadline();
      if (deadline == null) throw new IllegalStateException("sin plazo en " + room.phase);
      time.advance(Math.max(0, deadline - time.now()) + RoomCoordinator.DEADLINE_TOLERANCE_MS);
    }
    if (room.phase != RoomPhase.GAME_RESULTS) throw new IllegalStateException("la partida no terminó");
  }
}

package es.pokemonuniverse.application.daily;

import es.pokemonuniverse.adapters.out.persistence.DailyResultRepository;
import es.pokemonuniverse.application.friends.UserConnections;
import es.pokemonuniverse.application.rooms.DailyRunListener;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.room.DailyRoom;
import io.micronaut.context.annotation.Requires;
import io.micronaut.json.JsonMapper;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;

/**
 * Registra las partidas del reto diario. El coordinador lo llama con el lock de la sala tomado, así que
 * {@link #observe} y el cálculo del resultado son solo memoria; la escritura en BD y los avisos ({@code daily:recorded}
 * y {@link DailyResultEvents}) van en el ejecutor {@code BLOCKING}, fuera del lock, y los avisos solo después de que la
 * fila pase de verdad a {@code FINISHED}. No depende de {@code RoomCoordinator}: así este lo recibe sin ciclo.
 */
@Singleton
@Requires(beans = DailyResultRepository.class)
public class DailyRunRecorder implements DailyRunListener {

  /** Payload de {@code daily:recorded}. */
  @Serdeable
  public record RecordedPayload(String date, String gameId) {}

  static final String RECORDED_EVENT = "daily:recorded";

  private final DailyResultRepository results;
  private final UserConnections connections;
  private final DailyResultEvents events;
  private final Clock clock;
  private final JsonMapper json;
  private final Executor executor;

  @Inject
  public DailyRunRecorder(DailyResultRepository results, UserConnections connections, DailyResultEvents events,
      Clock clock, JsonMapper json, @Named(TaskExecutors.BLOCKING) ExecutorService executor) {
    this(results, connections, events, clock, json, (Executor) executor);
  }

  DailyRunRecorder(DailyResultRepository results, UserConnections connections, DailyResultEvents events,
      Clock clock, JsonMapper json, Executor executor) {
    this.results = results;
    this.connections = connections;
    this.events = events;
    this.clock = clock;
    this.json = json;
    this.executor = executor;
  }

  @Override
  public void observe(DailyRoom daily, Object publicState) {
    DailyGames.byId(daily.gameId).ifPresent(game -> game.observe(publicState, daily.userId, daily.outcomes));
  }

  @Override
  public CompletableFuture<Void> finished(DailyRoom daily, GameResults results) {
    var game = DailyGames.byId(daily.gameId)
        .orElseThrow(() -> new IllegalStateException("Juego del reto desconocido: " + daily.gameId));
    var outcome = DailyGames.outcome(game, daily.outcomes, results, daily.userId);
    daily.outcome = outcome;
    // Copias para la tarea: DailyRoom solo se toca con el lock de la sala.
    var rowId = daily.resultRowId;
    var userId = daily.userId;
    var date = daily.date.toString();
    var gameId = daily.gameId;
    var finishedAt = Instant.ofEpochMilli(clock.now());
    return CompletableFuture.runAsync(() -> {
      int updated = this.results.finish(rowId, outcome.score(), outcome.correct(), toJson(outcome.rounds()),
          finishedAt);
      if (updated == 0) return; // ya no estaba STARTED: nada que avisar
      connections.send(userId, RECORDED_EVENT, new RecordedPayload(date, gameId));
      events.finished(userId, new DailyResultView(date, gameId, outcome.score(), outcome.correct(), outcome.rounds(),
          finishedAt.toString()));
    }, executor);
  }

  @Override
  public CompletableFuture<Void> abandoned(DailyRoom daily) {
    var rowId = daily.resultRowId;
    var abandonedAt = Instant.ofEpochMilli(clock.now());
    return CompletableFuture.runAsync(() -> results.abandon(rowId, abandonedAt), executor);
  }

  private String toJson(List<Integer> rounds) {
    try {
      return json.writeValueAsString(rounds);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

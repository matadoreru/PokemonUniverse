package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.room.DailyRoom;
import es.pokemonuniverse.domain.room.GameFinishReason;
import es.pokemonuniverse.domain.room.GameRuntime;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.Presence;
import es.pokemonuniverse.domain.room.RoomMember;
import es.pokemonuniverse.domain.room.RoomPhase;
import es.pokemonuniverse.domain.room.RoomTimer;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Final de la sala del reto diario: observar la partida, terminarla y cerrarla cuando su jugador se va, avisando a
 * {@link DailyRunListener}. Se usa siempre con el lock de la sala tomado; las escrituras del oyente van en segundo
 * plano, en las tareas pendientes del coordinador.
 */
final class DailyRoomLifecycle {

  private static final Logger LOG = LoggerFactory.getLogger(DailyRoomLifecycle.class);

  /** {@code claimGameFinish} del coordinador: marca el final de {@code game} si sigue siendo la partida viva. */
  @FunctionalInterface
  interface FinishClaim {
    boolean claim(LiveRoom room, GameRuntime game, GameFinishReason reason);
  }

  private final RoomStore store;
  private final CursorRelay cursors;
  private final PendingTasks pending;
  private final DailyRunListener runs;
  private final Function<LiveRoom, GameContext> context;
  private final Consumer<AuthUser> activity;
  private final FinishClaim finishClaim;

  /** {@code context}: el contexto de la partida viva; {@code activity}: avisa a la presencia de amigos. */
  DailyRoomLifecycle(RoomStore store, CursorRelay cursors, PendingTasks pending, DailyRunListener runs,
      Function<LiveRoom, GameContext> context, Consumer<AuthUser> activity, FinishClaim finishClaim) {
    this.store = store;
    this.cursors = cursors;
    this.pending = pending;
    this.runs = runs;
    this.context = context;
    this.activity = activity;
    this.finishClaim = finishClaim;
  }

  /**
   * Solo memoria: el oyente apunta las rondas cerradas del estado público. Un fallo del oyente se registra y no rompe
   * la difusión ni la partida.
   */
  void observe(LiveRoom room, DailyRoom daily, GameRuntime game) {
    var publicState = game.engine.getPublicState(game.state, context.apply(room));
    try {
      runs.observe(daily, publicState);
    } catch (RuntimeException error) {
      LOG.error("Failed to observe daily run", error);
    }
  }

  /**
   * Final de una partida del reto: sin puntos de sesión, XP, auditoría ni {@link GameResultsPersister}. Se observa el
   * estado final (la última ronda y el historial de Distance) antes de que el oyente fije {@code daily.outcome}, que la
   * difusión siguiente ya publica; la escritura del resultado va en segundo plano, fuera del lock.
   */
  void finish(LiveRoom room, DailyRoom daily, GameRuntime game) {
    if (!finishClaim.claim(room, game, GameFinishReason.COMPLETED)) return;
    cursors.reset(room);
    game.skipVoterIds.clear();
    game.resultsApplied = true;
    room.gamesPlayed += 1;
    room.phase = RoomPhase.GAME_RESULTS;
    observe(room, daily, game);
    var gameResults = RoomCoordinator.copyResults(game.engine.getResults(game.state));
    CompletableFuture<Void> recorded;
    try {
      recorded = runs.finished(daily, gameResults);
    } catch (RuntimeException error) {
      recorded = CompletableFuture.failedFuture(error);
    }
    pending.track(recorded.exceptionally(error -> logged("Failed to record daily run", error)));
  }

  /**
   * El jugador del reto sale (o vence su gracia): la sala se cierra sin auditoría. Con la partida a medias se avisa del
   * abandono; tras los resultados, no.
   */
  void close(LiveRoom room, RoomMember member) {
    var playerId = member.identity.id();
    if (store.roomForPlayer(playerId) == room) cursors.clear(room, playerId);
    Presence.markLeft(member);
    room.members.remove(playerId);
    store.detachPlayer(playerId, room.code);
    room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
    store.delete(room.code);
    activity.accept(member.identity);
    var game = room.game;
    if (game != null && finishClaim.claim(room, game, GameFinishReason.ABANDONED)) {
      // Como en finish: un fallo síncrono del oyente se registra y no escapa de leave().
      CompletableFuture<Void> recorded;
      try {
        recorded = runs.abandoned(room.daily);
      } catch (RuntimeException error) {
        recorded = CompletableFuture.failedFuture(error);
      }
      pending.track(recorded.exceptionally(error -> logged("Failed to record abandoned daily run", error)));
    }
  }

  private static <T> T logged(String message, Throwable error) {
    LOG.error(message, error);
    return null;
  }
}

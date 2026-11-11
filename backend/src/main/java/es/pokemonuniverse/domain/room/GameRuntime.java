package es.pokemonuniverse.domain.room;

import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.function.DoubleSupplier;

/** {@code GameRuntime} de {@code rooms/types.ts}: una instancia de minijuego dentro de la sala. */
public final class GameRuntime {

  public final GameCatalogSnapshot catalog;
  public final String resultId;
  public final String gameId;
  /** Plantilla estable capturada al arrancar; la sala nunca inspecciona el estado opaco. */
  public final List<String> participantIds;
  public final ErasedEngine engine;
  public final Object config;
  /** Configuración normalizada como árbol JSON (la que se audita y persiste). */
  public final JsonNode configTree;
  public Object state;
  public final long startedAt;
  /** Se reclama de forma síncrona antes de que una finalización normal o un salto unánime avancen la sala. */
  public @Nullable GameFinishReason finishReason;
  /** Los votos pertenecen a esta instancia, no a una ronda interna. */
  public final Set<String> skipVoterIds = new LinkedHashSet<>();
  /** Participantes cuya gracia expiró o que salieron de esta instancia. */
  public final Set<String> departedParticipantIds = new LinkedHashSet<>();
  public boolean resultsApplied;
  /**
   * Fin de la intro (fase de sala {@code GAME_INTRO}): hasta entonces el motor no ha empezado ({@code start}).
   * {@code null} sin intro o cuando ya terminó.
   */
  public @Nullable Long introEndsAt;
  /** Jugadores que pulsaron «¡Listo!» en la intro. */
  public final Set<String> introReadyIds = new LinkedHashSet<>();
  /** {@code actionEpoch} del revelado al que pertenecen los «Siguiente» de {@link #revealNextIds}. */
  public @Nullable String revealNextEpoch;
  /** Jugadores que pulsaron «Siguiente» en el revelado {@link #revealNextEpoch}. */
  public final Set<String> revealNextIds = new LinkedHashSet<>();
  public CompletableFuture<Void> auditReady;
  /** Azar propio de la partida (el reto diario); {@code null} usa el de la sala. */
  public final @Nullable DoubleSupplier random;

  public GameRuntime(GameCatalogSnapshot catalog, String resultId, String gameId, List<String> participantIds,
      ErasedEngine engine, Object config, JsonNode configTree, Object state, long startedAt,
      CompletableFuture<Void> auditReady) {
    this(catalog, resultId, gameId, participantIds, engine, config, configTree, state, startedAt, auditReady, null);
  }

  public GameRuntime(GameCatalogSnapshot catalog, String resultId, String gameId, List<String> participantIds,
      ErasedEngine engine, Object config, JsonNode configTree, Object state, long startedAt,
      CompletableFuture<Void> auditReady, @Nullable DoubleSupplier random) {
    this.catalog = catalog;
    this.resultId = resultId;
    this.gameId = gameId;
    this.participantIds = List.copyOf(participantIds);
    this.engine = engine;
    this.config = config;
    this.configTree = configTree;
    this.state = state;
    this.startedAt = startedAt;
    this.auditReady = auditReady;
    this.random = random;
  }
}

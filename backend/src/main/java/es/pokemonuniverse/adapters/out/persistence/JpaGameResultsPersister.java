package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.achievements.AchievementEvents;
import es.pokemonuniverse.application.achievements.AchievementsUnlocked;
import es.pokemonuniverse.application.rooms.GameResultsPersister;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.GameResults;
import io.micronaut.core.type.Argument;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code persistGameResults} de {@code stats/service.ts}: una transacción {@code SERIALIZABLE} por intento, hasta 3,
 * reintentando ante un fallo de serialización o interbloqueo ({@code 40001}/{@code 40P01}, el P2034 de Prisma) o una
 * violación de unicidad ({@code 23505}, P2002); el reintento pasa por la comprobación de {@code resultId}.
 *
 * <p>Tras el commit avisa por {@link AchievementEvents} de los logros y récords nuevos que devolvió el intento que salió
 * bien; corre en su propio hilo virtual, fuera del cerrojo de la sala. Si se agotan los intentos no avisa de nada.
 */
@Singleton
public class JpaGameResultsPersister implements GameResultsPersister {

  static final int MAX_TRANSACTION_ATTEMPTS = 3;
  private static final Set<String> RETRYABLE = Set.of("40001", "40P01", "23505");
  private static final Logger LOG = LoggerFactory.getLogger(JpaGameResultsPersister.class);

  private final RoomHistoryWriter writer;
  private final GameRegistry registry;
  private final JsonMapper json;
  private final AchievementEvents events;
  private final ExecutorService executor = Executors.newThreadPerTaskExecutor(
      Thread.ofVirtual().name("game-results-", 0).factory());

  public JpaGameResultsPersister(RoomHistoryWriter writer, GameRegistry registry, JsonMapper json,
      AchievementEvents events) {
    this.writer = writer;
    this.registry = registry;
    this.json = json;
    this.events = events;
  }

  @Override
  public CompletableFuture<Void> persist(ResultRoomSnapshot room, GameResults results, String resultId, long startedAt,
      String gameId, JsonNode config) {
    return CompletableFuture.runAsync(() -> persistNow(room, results, resultId, startedAt, gameId, config), executor);
  }

  /** Síncrono; lo usan las pruebas. */
  public void persistNow(ResultRoomSnapshot room, GameResults results, String resultId, long startedAt, String gameId,
      JsonNode config) {
    var metrics = registry.get(gameId).map(manifest -> manifest.profileStats().metrics())
        .orElseThrow(() -> new IllegalStateException("No profile statistics registered for " + gameId));
    var standings = new ArrayList<RoomHistoryWriter.StandingRow>();
    for (var standing : results.standings()) {
      var identity = room.members().get(standing.playerId());
      if (identity == null) throw new IllegalStateException("Missing result identity: " + standing.playerId());
      standings.add(new RoomHistoryWriter.StandingRow(standing, identity));
    }
    var configObject = jsonObject(config);
    Map<String, AchievementsUnlocked> unlocked = Map.of();
    for (int attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        // Solo cuenta el mapa del intento confirmado: uno revertido no deja filas y el siguiente lo recalcula.
        unlocked = writer.persistResults(room.historyId(), room.code(), results, standings, resultId,
            Instant.ofEpochMilli(startedAt), gameId, configObject, metrics);
        break;
      } catch (RuntimeException error) {
        // Reintenta a través de la comprobación de resultId; otra violación de unicidad nunca es un éxito.
        if (!isRetryable(error) || attempt == MAX_TRANSACTION_ATTEMPTS) throw error;
      }
    }
    unlocked.forEach(this::notifyUnlocked);
  }

  private void notifyUnlocked(String userId, AchievementsUnlocked payload) {
    try {
      events.unlocked(userId, payload);
    } catch (RuntimeException error) {
      // Los resultados ya están confirmados: un aviso que falla no los toca ni corta los de las demás cuentas.
      LOG.warn("Failed to notify unlocked achievements to {}", userId, error);
    }
  }

  static boolean isRetryable(Throwable error) {
    for (Throwable cause = error; cause != null; cause = cause.getCause()) {
      if (cause instanceof SQLException sql && RETRYABLE.contains(sql.getSQLState())) return true;
      if (cause instanceof org.hibernate.JDBCException jdbc && RETRYABLE.contains(jdbc.getSQLState())) return true;
      if (cause.getCause() == cause) break;
    }
    return false;
  }

  private Map<String, Object> jsonObject(JsonNode node) {
    try {
      return json.readValueFromTree(node, Argument.mapOf(String.class, Object.class));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @PreDestroy
  void close() {
    executor.shutdown();
  }
}

package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.application.time.RandomSource;
import es.pokemonuniverse.domain.game.GameConfigReadiness;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.room.ErasedEngine;
import es.pokemonuniverse.domain.room.GameModes;
import es.pokemonuniverse.domain.room.GamePick;
import es.pokemonuniverse.domain.room.GameSelectionMode;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.PresenceStatus;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.BiFunction;
import java.util.function.Function;

/**
 * Rotación de la sesión: qué pares de juego y modo pueden salir con los conectados, el primero y los siguientes, y el
 * azar de la sala ({@code randomItem}/{@code shuffled}, que también usa la votación del siguiente juego). Se usa
 * siempre con el lock de la sala tomado; el orden de las llamadas a {@code random.next()} es el de los tests de sala.
 */
final class GameRotation {

  private final GameRegistry registry;
  private final Map<String, ErasedEngine> engines;
  private final RandomSource random;
  private final Function<Object, JsonNode> toTree;
  private final BiFunction<LiveRoom, Integer, GameConfigReadiness.Context> readinessContext;
  private final Function<LiveRoom, GameContext> lobbyContext;

  /**
   * {@code readinessContext}: el de {@code GameConfigReadiness} con ese recuento de jugadores; {@code lobbyContext}: el
   * contexto de la sala con el catálogo vigente (el de la siguiente partida, no el de la que acaba de terminar).
   */
  GameRotation(GameRegistry registry, Map<String, ErasedEngine> engines, RandomSource random,
      Function<Object, JsonNode> toTree, BiFunction<LiveRoom, Integer, GameConfigReadiness.Context> readinessContext,
      Function<LiveRoom, GameContext> lobbyContext) {
    this.registry = registry;
    this.engines = engines;
    this.random = random;
    this.toTree = toTree;
    this.readinessContext = readinessContext;
    this.lobbyContext = lobbyContext;
  }

  <T> T randomItem(List<T> items) {
    int index = (int) Math.floor(random.next() * items.size());
    if (index >= items.size()) throw new RoomException("No hay minijuegos disponibles.");
    return items.get(index);
  }

  <T> List<T> shuffled(List<T> items) {
    var result = new ArrayList<>(items);
    for (int index = result.size() - 1; index > 0; index -= 1) {
      int swapIndex = (int) Math.floor(random.next() * (index + 1));
      var swap = result.get(swapIndex);
      result.set(swapIndex, result.get(index));
      result.set(index, swap);
    }
    return result;
  }

  int connectedPlayerCount(LiveRoom room) {
    return (int) room.members.values().stream().filter(member -> member.presence == PresenceStatus.CONNECTED).count();
  }

  /**
   * Los pares juego y modo que pueden salir de {@code gameIds}: cada modo permitido de cada juego (un juego sin modos
   * es un par) cuya configuración con ese modo admite a los conectados. Van en el orden de {@code gameIds} y, dentro de
   * cada juego, en el del catálogo de modos: por orden es la cola de la sesión.
   */
  List<GamePick> playablePicks(LiveRoom room, List<String> gameIds) {
    int playerCount = connectedPlayerCount(room);
    return allPicks(room, gameIds).stream().filter(pick -> playable(room, pick, playerCount)).toList();
  }

  /** Todos los pares de {@code gameIds} con sus modos permitidos, jugables o no (la cola completa por orden). */
  private List<GamePick> allPicks(LiveRoom room, List<String> gameIds) {
    var picks = new ArrayList<GamePick>();
    for (var gameId : gameIds) {
      var modes = allowedModes(room, gameId);
      if (modes.isEmpty()) {
        picks.add(new GamePick(gameId, null));
      } else {
        for (var mode : modes) picks.add(new GamePick(gameId, mode));
      }
    }
    return picks;
  }

  private List<String> allowedModes(LiveRoom room, String gameId) {
    return GameModes.allowed(room.allowedModes, gameId, room.gameConfigs.get(gameId));
  }

  /** La configuración con la que arranca {@code pick}: la del lobby con el modo del par, si lo trae. */
  @Nullable JsonNode pickConfig(LiveRoom room, GamePick pick) {
    var config = room.gameConfigs.get(pick.gameId());
    return pick.mode() == null ? config : GameModes.withMode(config, pick.mode());
  }

  boolean playable(LiveRoom room, GamePick pick, int playerCount) {
    var gameId = pick.gameId();
    var module = registry.get(gameId).orElse(null);
    var engine = engine(gameId).orElse(null);
    if (module == null || engine == null || !ManifestView.supportsPlayerCount(module, playerCount)) return false;
    Object parsed;
    try {
      parsed = engine.parseConfig(pickConfig(room, pick));
    } catch (ConfigValidationException e) {
      return false;
    }
    return GameConfigReadiness.validate(gameId, toTree.apply(parsed), readinessContext.apply(room, playerCount))
        .isEmpty() && engine.checkAvailability(parsed, lobbyContext.apply(room)).isEmpty();
  }

  private Optional<String> gameConfigReadinessReason(LiveRoom room, String gameId) {
    if (registry.get(gameId).isEmpty()) return Optional.of("Minijuego desconocido.");
    var engine = engine(gameId).orElseThrow(() -> new IllegalStateException("Sin motor: " + gameId));
    Object parsed;
    try {
      parsed = engine.parseConfig(room.gameConfigs.get(gameId));
    } catch (ConfigValidationException e) {
      return Optional.of(e.getMessage() != null ? e.getMessage() : "Configuración inválida.");
    }
    // Sin recuento de jugadores: en una rotación, lo que depende de los conectados excluye el juego en
    // playablePicks (como el rango del manifiesto) en vez de bloquear la sala.
    var staticReason = GameConfigReadiness.validate(gameId, toTree.apply(parsed), readinessContext.apply(room, 0));
    if (staticReason.isPresent()) return staticReason;
    return engine.checkAvailability(parsed, lobbyContext.apply(room));
  }

  /**
   * Al empezar: todos los juegos elegidos existen y tienen una configuración válida, y al menos uno admite a los
   * conectados. Con un solo juego elegido, {@code RoomCoordinator.launchGame} da el motivo exacto (mínimo o máximo).
   */
  void assertRotationReady(LiveRoom room) {
    var gameIds = room.gameSelectionMode.gameIds();
    for (var gameId : gameIds) {
      var module = registry.get(gameId).orElseThrow(() -> new RoomException("Minijuego desconocido: " + gameId));
      var configReason = gameConfigReadinessReason(room, gameId);
      if (configReason.isPresent()) throw new RoomException(module.name() + ": " + configReason.get());
    }
    if (gameIds.size() > 1 && playablePicks(room, gameIds).isEmpty()) {
      throw new RoomException("Ningún minijuego elegido admite el número actual de jugadores.");
    }
  }

  /**
   * Primer juego de la sesión: el primer par jugable de la lista (en aleatorio, un par al azar: cada juego y modo con
   * la misma probabilidad).
   */
  GamePick firstPick(LiveRoom room) {
    var mode = room.gameSelectionMode;
    var playable = playablePicks(room, mode.gameIds());
    if (playable.isEmpty()) {
      return new GamePick(mode.gameIds().isEmpty() ? room.selectedGameId : mode.gameIds().getFirst(), null);
    }
    return mode instanceof GameSelectionMode.Random ? randomItem(playable) : playable.getFirst();
  }

  /**
   * Pares que pueden seguir a {@code previous}, el preferido primero: en orden, los pares siguientes de la cola (cada
   * modo marcado de un juego ocupa su propio turno; vuelve al principio y el propio par va el último); en aleatorio, un
   * par al azar distinto del anterior si lo hay y después el resto. Los demás son reserva por si el preferido no puede
   * arrancar.
   */
  List<GamePick> nextPicks(LiveRoom room, GamePick previous, List<GamePick> candidates) {
    if (room.gameSelectionMode instanceof GameSelectionMode.Random) {
      var alternatives = candidates.stream().filter(pick -> !pick.equals(previous)).toList();
      var preferred = randomItem(alternatives.isEmpty() ? candidates : alternatives);
      var ordered = new ArrayList<GamePick>();
      ordered.add(preferred);
      for (var pick : candidates) if (!pick.equals(preferred)) ordered.add(pick);
      return ordered;
    }
    var queue = allPicks(room, room.gameSelectionMode.gameIds());
    if (queue.isEmpty()) return candidates;
    // Si el par anterior ya no está en la cola (se desmarcó su modo), se sigue tras el último par de su juego.
    int index = queue.indexOf(previous);
    if (index < 0) {
      for (int i = 0; i < queue.size(); i++) if (queue.get(i).gameId().equals(previous.gameId())) index = i;
    }
    int start = index + 1;
    var ordered = new ArrayList<GamePick>();
    for (int step = 0; step < queue.size(); step++) {
      var pick = queue.get((start + step) % queue.size());
      if (candidates.contains(pick)) ordered.add(pick);
    }
    return ordered;
  }

  private Optional<ErasedEngine> engine(@Nullable String gameId) {
    return gameId == null ? Optional.empty() : Optional.ofNullable(engines.get(gameId));
  }
}

package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.application.assets.GameAssetService;
import es.pokemonuniverse.application.rooms.RoomAuditSink.GameAbandoned;
import es.pokemonuniverse.application.rooms.RoomAuditSink.GameStarted;
import es.pokemonuniverse.application.rooms.RoomAuditSink.RoomClosed;
import es.pokemonuniverse.application.rooms.RoomAuditSink.RoomCreated;
import es.pokemonuniverse.application.rooms.RoomCommandParsers.GameActionRequest;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.application.time.RandomSource;
import es.pokemonuniverse.domain.game.GameConfigReadiness;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.Scoring;
import es.pokemonuniverse.domain.game.engine.AssetRequest;
import es.pokemonuniverse.domain.game.engine.AssetResolution;
import es.pokemonuniverse.domain.game.engine.ConfigValidationException;
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.room.ErasedEngine;
import es.pokemonuniverse.domain.room.GameCatalogSnapshot;
import es.pokemonuniverse.domain.room.GameFinishReason;
import es.pokemonuniverse.domain.room.GameRuntime;
import es.pokemonuniverse.domain.room.GameSelectionMode;
import es.pokemonuniverse.domain.room.GameSkip;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.MemberRole;
import es.pokemonuniverse.domain.room.NextGameVote;
import es.pokemonuniverse.domain.room.Presence;
import es.pokemonuniverse.domain.room.PresenceStatus;
import es.pokemonuniverse.domain.room.RoomCodes;
import es.pokemonuniverse.domain.room.RoomMember;
import es.pokemonuniverse.domain.room.RoomPermission;
import es.pokemonuniverse.domain.room.RoomPhase;
import es.pokemonuniverse.domain.room.RoomRole;
import es.pokemonuniverse.domain.room.RoomTexts;
import es.pokemonuniverse.domain.room.RoomTimer;
import es.pokemonuniverse.domain.room.SessionGameSummary;
import es.pokemonuniverse.domain.room.SessionMode;
import es.pokemonuniverse.domain.room.SessionParticipant;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Port literal de {@code apps/server/src/rooms/manager.ts}: el coordinador autoritativo de salas.
 *
 * <p>Concurrencia (constraint 9): Node es de un solo hilo y cada manejador muta la sala sin {@code await}; aquí cada
 * método público, callback de temporizador y evento de conexión toma el {@link LiveRoom#lock} de la sala que toca
 * ({@code ReentrantLock}, reentrante para las llamadas internas). La búsqueda jugador → sala usa los mapas concurrentes
 * de {@link RoomStore} y se revalida tras tomar el lock (la sala puede haberse borrado o el jugador haberse ido). Ningún
 * camino toma dos locks de sala a la vez, así que no hay interbloqueos. Los temporizadores se crean y se asignan antes
 * de programarse; el callback re-entra por el lock y comprueba {@code room.transitionTimer == timer} (Review Focus 2).
 *
 * <p>Los mensajes de error son los de {@code manager.ts}, sin traducir; viajan en {@link RoomException}.
 */
@Singleton
public class RoomCoordinator {

  /** Juego registrado cuyo motor aún no existe en Java (etapa 2). */
  public static final String NOT_PORTED = "Este minijuego todavía no está disponible en el servidor Java.";
  static final long NEXT_GAME_VOTE_MS = 15_000;
  static final long NEXT_GAME_VOTE_RESULT_MS = 3_000;
  static final int MAX_SESSION_HISTORY = 100;
  /** {@code scheduleDeadline(..., toleranceMs = 5)}. */
  static final long DEADLINE_TOLERANCE_MS = 5;

  private static final Logger LOG = LoggerFactory.getLogger(RoomCoordinator.class);

  private volatile boolean stopping;
  /** Catálogo y versión se publican juntos: una lectura nunca mezcla el catálogo nuevo con la versión anterior. */
  private volatile GameCatalogSnapshot currentCatalog;
  private final PendingTasks pending = new PendingTasks();
  final RoomStore store = new RoomStore();
  private final CursorRelay cursors;
  private final RoomViews views;

  private final GameRegistry registry;
  private final JsonMapper json;
  private final RoomEvents events;
  private final RoomAuditSink audit;
  private final GameResultsPersister results;
  private final UserGameConfigPreferences userGameConfigs;
  private final HostContentProvider hostContent;
  private final Clock clock;
  private final RandomSource random;
  private final RoomSchedulers schedulers;
  private final RoomSettings settings;
  private final GameAssetService assets;
  private final Map<String, JsonNode> defaultConfigs = new LinkedHashMap<>();
  /** Motores portados con los tipos borrados, uno por juego. */
  private final Map<String, ErasedEngine> engines = new LinkedHashMap<>();

  @Inject
  public RoomCoordinator(GameRegistry registry, JsonMapper json, RoomEvents events, RoomAuditSink audit,
      GameResultsPersister results, UserGameConfigPreferences userGameConfigs, HostContentProvider hostContent,
      Clock clock, RandomSource random, RoomSchedulers schedulers, RoomSettings settings,
      GameCatalogProvider catalog, GameAssetService assets) {
    this.registry = registry;
    this.json = json;
    this.events = events;
    this.audit = audit;
    this.results = results;
    this.userGameConfigs = userGameConfigs;
    this.hostContent = hostContent;
    this.clock = clock;
    this.random = random;
    this.schedulers = schedulers;
    this.settings = settings;
    this.assets = assets;
    this.cursors = new CursorRelay(events, clock);
    this.views = new RoomViews(registry, defaultConfigs, clock, events, this::toTree);
    this.currentCatalog = snapshot(catalog.loadPokemonCatalog());
    for (var manifest : registry.list()) {
      defaultConfigs.put(manifest.id(), toTree(manifest.defaultConfig()));
      registry.engine(manifest.id()).ifPresent(engine -> engines.put(manifest.id(), new ErasedEngine(engine)));
    }
  }

  /** Las partidas en curso conservan sus catálogos; la siguiente usa estos. */
  public void replaceCatalog(GameCatalogs value) {
    this.currentCatalog = snapshot(value);
  }

  private GameCatalogSnapshot snapshot(GameCatalogs value) {
    return new GameCatalogSnapshot(random.uuid(), value.pokemon(), value.visuals(), value.audio());
  }

  private GameCatalogSnapshot catalogSnapshot() {
    return currentCatalog;
  }

  public void stop() {
    stopping = true;
    for (var room : store.list()) {
      locked(room, () -> {
        room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
        for (var member : room.members.values()) member.disconnectTimer = RoomTimer.cancel(member.disconnectTimer);
        return null;
      });
    }
  }

  /** Espera la auditoría y la persistencia de resultados aceptadas. */
  public void flush() {
    pending.flush();
  }

  @PreDestroy
  void shutdown() {
    stop();
    if (!pending.flush(Duration.ofSeconds(10))) LOG.warn("Quedan tareas de sala sin persistir al cerrar");
  }

  public boolean isStopping() {
    return stopping;
  }

  /** {@code guard}: el transporte rechaza todo comando mientras el servidor se cierra. */
  public void assertAcceptingCommands() {
    if (stopping) throw new RoomException("El servidor se está cerrando");
  }

  // ---------------------------------------------------------------------------------------------- conexión (bind)

  /**
   * {@code bind(socket)}: devuelve {@code false} si el servidor se cierra (el transporte desconecta). Si la identidad
   * ya pertenece a una sala, la restaura y emite {@code session:restored} a esta conexión.
   */
  public boolean connect(AuthUser identity, String connectionId) {
    if (stopping) return false;
    restore(identity, connectionId);
    return true;
  }

  /**
   * {@code currentSocket}: ejecuta {@code operation} solo si {@code connectionId} es la conexión vigente del miembro
   * ({@code assertActiveSocket}), dentro del lock de su sala. No envolver {@code create}/{@code join} (Node tampoco).
   */
  public <T> T withConnection(String playerId, String connectionId, Supplier<T> operation) {
    return inOptionalRoom(playerId, room -> {
      if (room != null) assertActiveSocket(room, playerId, connectionId);
      return operation.get();
    });
  }

  private void assertActiveSocket(LiveRoom room, String playerId, String connectionId) {
    var member = room.members.get(playerId);
    if (member != null && !Objects.equals(member.connectionId, connectionId)) {
      throw new RoomException("Esta conexión ha sido reemplazada por una sesión más reciente.");
    }
  }

  void restore(AuthUser identity, String connectionId) {
    inOptionalRoom(identity.id(), room -> {
      var member = room == null ? null : room.members.get(identity.id());
      if (room == null || member == null) return null;
      Presence.restoreMember(member, identity, connectionId);
      var host = room.members.get(room.hostId);
      if (host != null && !host.connected && host.disconnectTimer == null) transferHost(room);
      events.sendToMember(identity.id(), connectionId, "session:restored", view(room, identity.id()));
      applyPresenceChange(room);
      return null;
    });
  }

  // ------------------------------------------------------------------------------------------ entrar y salir

  /** {@code room:create}; {@code requestedMax} es el {@code maxPlayers} crudo del payload (ausente o {@code null}). */
  public RoomView create(AuthUser identity, String connectionId, @Nullable JsonNode requestedMax) {
    return engineErrors(() -> {
      if (store.roomForPlayer(identity.id()) != null) throw new RoomException("Already in a room");
      while (true) {
        var code = roomCode();
        while (store.get(code) != null) code = roomCode();
        var module = registry.list().getFirst();
        double desiredMax = requestedMax == null || requestedMax.isNull() ? settings.roomMaxPlayers()
            : requestedMax.isNumber() ? requestedMax.getDoubleValue() : Double.NaN;
        if (!isInteger(desiredMax) || desiredMax < 2) {
          throw new RoomException("Room capacity must be an integer of at least 2");
        }
        int maxPlayers = (int) Math.min(desiredMax, 100);
        long now = clock.now();
        Map<String, JsonNode> storedConfigs = identity.kind() == AuthUser.Kind.USER
            ? userGameConfigs.forUser(identity.id()) : Map.of();
        var gameConfigs = new LinkedHashMap<String, JsonNode>();
        for (var game : registry.list()) {
          var stored = storedConfigs.get(game.id());
          gameConfigs.put(game.id(), normalizedConfig(game, stored != null ? stored : defaultConfigs.get(game.id())));
        }
        var room = new LiveRoom(random.uuid(), code, identity.id(), maxPlayers, module.id(), gameConfigs, now);
        room.lock.lock();
        try {
          room.members.put(identity.id(), member(identity, connectionId, MemberRole.PLAYER, RoomRole.HOST));
          room.sessionParticipants.put(identity.id(), new SessionParticipant(identity, 0));
          if (!store.saveIfAbsent(room)) continue; // otra sala ocupó el código entre la comprobación y el guardado
          if (!store.attachUnlessInOtherRoom(identity.id(), code)) {
            store.delete(code);
            throw new RoomException("Already in a room");
          }
          track(audit.roomCreated(new RoomCreated(room.historyId, code,
              identity.kind() == AuthUser.Kind.USER ? identity.id() : null, identity.displayName(), maxPlayers, now)),
              "Failed to persist room creation");
          return view(room, identity.id());
        } finally {
          room.lock.unlock();
        }
      }
    });
  }

  /** {@code room:join}; {@code rawCode} es el {@code code} crudo del payload. */
  public RoomView join(AuthUser identity, String connectionId, @Nullable JsonNode rawCode) {
    var code = RoomCommandParsers.roomCode(rawCode);
    return engineErrors(() -> {
      while (true) {
        var existing = store.roomForPlayer(identity.id());
        if (existing != null && !existing.code.equals(code)) throw new RoomException("Leave your current room first");
        var room = store.get(code);
        if (room == null) throw new RoomException("Room not found");
        room.lock.lock();
        try {
          if (store.get(code) != room) continue;
          var current = room.members.get(identity.id());
          if (current == null && room.members.size() >= room.maxPlayers) throw new RoomException("Room is full");
          if (!store.attachUnlessInOtherRoom(identity.id(), room.code)) {
            throw new RoomException("Leave your current room first");
          }
          if (current != null) {
            boolean expiredDuringGame = current.presence == PresenceStatus.LEFT && room.game != null;
            Presence.restoreMember(current, identity, connectionId);
            if (expiredDuringGame) current.role = MemberRole.SPECTATOR;
          } else {
            room.members.put(identity.id(), member(identity, connectionId,
                room.phase == RoomPhase.LOBBY ? MemberRole.PLAYER : MemberRole.SPECTATOR, RoomRole.MEMBER));
          }
          var participant = room.sessionParticipants.get(identity.id());
          if (participant != null) participant.identity = identity;
          else room.sessionParticipants.put(identity.id(),
              new SessionParticipant(identity, current != null ? current.sessionPoints : 0));
          applyPresenceChange(room);
          return view(room, identity.id());
        } finally {
          room.lock.unlock();
        }
      }
    });
  }

  /** Atajo para pruebas y transporte: código ya extraído como texto. */
  public RoomView join(AuthUser identity, String connectionId, String code) {
    return join(identity, connectionId, JsonNode.createStringNode(code));
  }

  private RoomMember member(AuthUser identity, String connectionId, MemberRole role, RoomRole roomRole) {
    return new RoomMember(identity, connectionId, role, roomRole, clock.now());
  }

  public void updateIdentityAvatar(String userId, AvatarRef avatar) {
    inOptionalRoom(userId, room -> {
      var member = room == null ? null : room.members.get(userId);
      if (room == null || member == null) return null;
      var identity = member.identity;
      member.identity = new AuthUser(identity.id(), identity.displayName(), identity.kind(), identity.email(),
          identity.role(), avatar);
      var participant = room.sessionParticipants.get(userId);
      if (participant != null) participant.identity = member.identity;
      broadcast(room);
      return null;
    });
  }

  public void updateHostCategories(String userId) {
    inOptionalRoom(userId, room -> {
      if (room != null && room.hostId.equals(userId)) broadcast(room);
      return null;
    });
  }

  /** Reemite {@code room:state} si {@code userId} es host de su sala: el recuento de dilemas del host ha cambiado. */
  public void updateHostWouldYouRatherPrompts(String userId) {
    inOptionalRoom(userId, room -> {
      if (room != null && room.hostId.equals(userId)) broadcast(room);
      return null;
    });
  }

  public void leave(String playerId) {
    inRequiredRoom(playerId, room -> {
      finalDisconnect(room, playerId, true);
      return null;
    });
  }

  /** Cierre de la conexión {@code connectionId}: abre la gracia de reconexión si es la conexión vigente. */
  public void disconnect(String playerId, String connectionId) {
    if (stopping) return;
    inOptionalRoom(playerId, room -> {
      var member = room == null ? null : room.members.get(playerId);
      if (room == null || member == null || !Objects.equals(member.connectionId, connectionId)) return null;
      clearWhoIsWhoCursor(room, playerId);
      Presence.markTemporarilyDisconnected(member);
      applyPresenceChange(room);
      var timer = new RoomTimer();
      member.disconnectTimer = timer;
      timer.bind(schedulers.schedule(settings.reconnectGraceMs(), () -> timerCallback(room, () -> {
        if (room.members.get(playerId) != member || member.disconnectTimer != timer) return;
        finalDisconnect(room, playerId, false);
      })));
      return null;
    });
  }

  void finalDisconnect(LiveRoom room, String playerId, boolean explicit) {
    var member = room.members.get(playerId);
    if (member == null) return;
    if (!explicit && member.connected) return;
    clearWhoIsWhoCursor(room, playerId);
    Presence.markLeft(member);
    var game = room.game;
    if (game != null && game.finishReason == null && game.participantIds.contains(playerId)) {
      game.departedParticipantIds.add(playerId);
    }
    boolean retainedByLiveGame = Presence.gameRetainsPlayer(room, playerId);
    if (!retainedByLiveGame) room.members.remove(playerId);
    store.detachPlayer(playerId, room.code);
    if (room.hostId.equals(playerId)) transferHost(room);
    if (room.members.values().stream().noneMatch(candidate -> candidate.presence != PresenceStatus.LEFT)) {
      room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
      store.delete(room.code);
      track(audit.roomClosed(new RoomClosed(room.historyId, explicit ? "EMPTY_AFTER_LEAVE" : "EMPTY_AFTER_TIMEOUT",
          room.game != null && room.game.finishReason == null ? room.game.resultId : null, clock.now())),
          "Failed to persist room closure");
      return;
    }
    applyPresenceChange(room);
  }

  private void transferHost(LiveRoom room) {
    var next = Presence.oldestConnectedMember(room).orElse(null);
    if (next == null) return;
    for (var member : room.members.values()) if (member.roomRole == RoomRole.HOST) member.roomRole = RoomRole.MEMBER;
    next.roomRole = RoomRole.HOST;
    next.ready = false;
    room.hostId = next.identity.id();
  }

  // ---------------------------------------------------------------------------------------------- lobby

  public void selectGame(String playerId, @Nullable String gameId) {
    inRequiredRoom(playerId, ignored -> {
      var room = permissionRoom(playerId, RoomPermission.CHANGE_GAME);
      assertLobby(room);
      var module = registry.get(gameId).orElseThrow(() -> new RoomException("Unknown game"));
      room.selectedGameId = gameId;
      if (!room.gameConfigs.containsKey(gameId)) {
        room.gameConfigs.put(gameId, normalizedConfig(module, defaultConfigs.get(gameId)));
      }
      broadcast(room);
      return null;
    });
  }

  public void updateConfig(String playerId, @Nullable JsonNode config) {
    inRequiredRoom(playerId, room -> {
      updateGameConfig(playerId, room.selectedGameId, config);
      return null;
    });
  }

  public void updateGameConfig(String playerId, @Nullable String gameId, @Nullable JsonNode config) {
    inRequiredRoom(playerId, ignored -> {
      var room = permissionRoom(playerId, RoomPermission.EDIT_GAME_CONFIG);
      assertLobby(room);
      registry.get(gameId).orElseThrow(() -> new RoomException("Minijuego desconocido."));
      var engine = engine(gameId).orElseThrow(() -> new RoomException(NOT_PORTED));
      var parsed = toTree(engine.parseConfig(config));
      room.gameConfigs.put(gameId, parsed);
      var actor = room.members.get(playerId);
      if (actor != null && actor.identity.kind() == AuthUser.Kind.USER) {
        userGameConfigs.save(actor.identity.id(), gameId, parsed);
      }
      broadcast(room);
      return null;
    });
  }

  public void updateSession(String playerId, @Nullable JsonNode mode) {
    inRequiredRoom(playerId, ignored -> {
      var room = permissionRoom(playerId, RoomPermission.EDIT_SESSION);
      assertLobby(room);
      room.sessionMode = RoomCommandParsers.sessionMode(mode);
      broadcast(room);
      return null;
    });
  }

  public void updateGameSelection(String playerId, @Nullable JsonNode mode) {
    inRequiredRoom(playerId, ignored -> {
      var room = permissionRoom(playerId, RoomPermission.EDIT_GAME_SELECTION);
      assertLobby(room);
      var parsed = RoomCommandParsers.gameSelectionMode(mode);
      if (!(parsed instanceof GameSelectionMode.Fixed)) {
        int playerCount = connectedPlayerCount(room);
        for (var gameId : GameSelectionMode.gameIdsOf(parsed)) {
          var game = registry.get(gameId).orElseThrow(() -> new RoomException("Minijuego desconocido: " + gameId));
          if (!ManifestView.supportsPlayerCount(game, playerCount)) {
            throw new RoomException(game.name() + " no admite " + playerCount + " jugadores conectados.");
          }
          if (!registry.isPorted(gameId)) throw new RoomException(NOT_PORTED);
        }
      }
      room.gameSelectionMode = parsed;
      broadcast(room);
      return null;
    });
  }

  public void setRoomRole(String actorId, @Nullable String playerId, @Nullable JsonNode requestedRole) {
    inRequiredRoom(actorId, ignored -> {
      var room = permissionRoom(actorId, RoomPermission.MANAGE_ROLES);
      assertLobby(room);
      var role = RoomCommandParsers.assignableRole(requestedRole);
      if (room.hostId.equals(playerId)) throw new RoomException("El Host no puede cambiar su propio rol.");
      var member = playerId == null ? null : room.members.get(playerId);
      if (member == null || member.presence == PresenceStatus.LEFT) throw new RoomException("Jugador no encontrado.");
      member.roomRole = role;
      broadcast(room);
      return null;
    });
  }

  /** {@code room:transfer-host} ({@code transferHostManually}). */
  public void transferHost(String actorId, @Nullable String playerId) {
    inRequiredRoom(actorId, ignored -> {
      var room = permissionRoom(actorId, RoomPermission.TRANSFER_HOST);
      assertLobby(room);
      if (actorId.equals(playerId)) throw new RoomException("Ya eres el Host.");
      var target = playerId == null ? null : room.members.get(playerId);
      if (target == null || target.presence != PresenceStatus.CONNECTED) {
        throw new RoomException("Solo puedes transferir el Host a un jugador conectado.");
      }
      var priorHost = room.members.get(room.hostId);
      if (priorHost != null) {
        priorHost.roomRole = RoomRole.CO_HOST;
        priorHost.ready = false;
      }
      target.roomRole = RoomRole.HOST;
      target.ready = false;
      room.hostId = playerId;
      broadcast(room);
      return null;
    });
  }

  public void kick(String actorId, @Nullable String playerId) {
    inRequiredRoom(actorId, ignored -> {
      var room = permissionRoom(actorId, RoomPermission.KICK_MEMBER);
      assertLobby(room);
      if (actorId.equals(playerId) || room.hostId.equals(playerId)) {
        throw new RoomException("El Host no puede expulsarse a sí mismo.");
      }
      var member = playerId == null ? null : room.members.get(playerId);
      if (member == null) throw new RoomException("Player not found");
      if (member.connectionId != null) events.kick(playerId, member.connectionId, "El host te ha expulsado de la sala.");
      clearWhoIsWhoCursor(room, playerId);
      Presence.markLeft(member);
      room.members.remove(playerId);
      store.detachPlayer(playerId, room.code);
      broadcast(room);
      return null;
    });
  }

  /** {@code room:set-ready}; {@code requestedReady} crudo: solo un booleano es válido. */
  public void setReady(String playerId, @Nullable JsonNode requestedReady) {
    inRequiredRoom(playerId, room -> {
      assertLobby(room);
      var member = room.members.get(playerId);
      if (member == null || member.presence != PresenceStatus.CONNECTED) {
        throw new RoomException("No puedes cambiar tu estado de preparación ahora.");
      }
      if (member.roomRole == RoomRole.HOST) {
        throw new RoomException("El host inicia la partida y no necesita marcarse como listo.");
      }
      if (requestedReady == null || !requestedReady.isBoolean()) throw new RoomException("Estado de preparación inválido.");
      member.ready = requestedReady.getBooleanValue();
      broadcast(room);
      return null;
    });
  }

  public void setReady(String playerId, boolean ready) {
    setReady(playerId, JsonNode.createBooleanNode(ready));
  }

  // ---------------------------------------------------------------------------------------- rotación y arranque

  private <T> T randomItem(List<T> items) {
    int index = (int) Math.floor(random.next() * items.size());
    if (index >= items.size()) throw new RoomException("No hay minijuegos disponibles.");
    return items.get(index);
  }

  private <T> List<T> shuffled(List<T> items) {
    var result = new ArrayList<>(items);
    for (int index = result.size() - 1; index > 0; index -= 1) {
      int swapIndex = (int) Math.floor(random.next() * (index + 1));
      var swap = result.get(swapIndex);
      result.set(swapIndex, result.get(index));
      result.set(index, swap);
    }
    return result;
  }

  private int connectedPlayerCount(LiveRoom room) {
    return (int) room.members.values().stream().filter(member -> member.presence == PresenceStatus.CONNECTED).count();
  }

  List<String> playableGameIds(LiveRoom room, List<String> gameIds) {
    int playerCount = connectedPlayerCount(room);
    return gameIds.stream().filter(gameId -> {
      var module = registry.get(gameId).orElse(null);
      var engine = engine(gameId).orElse(null);
      if (module == null || engine == null || !ManifestView.supportsPlayerCount(module, playerCount)) return false;
      Object parsed;
      try {
        parsed = engine.parseConfig(room.gameConfigs.get(gameId));
      } catch (ConfigValidationException e) {
        return false;
      }
      return GameConfigReadiness.validate(gameId, toTree(parsed), readinessContext(room)).isEmpty()
          && engine.checkAvailability(parsed, context(room, catalogSnapshot())).isEmpty();
    }).toList();
  }

  private Optional<String> gameConfigReadinessReason(LiveRoom room, String gameId) {
    if (registry.get(gameId).isEmpty()) return Optional.of("Minijuego desconocido.");
    var engine = engine(gameId).orElse(null);
    if (engine == null) return Optional.of(NOT_PORTED);
    Object parsed;
    try {
      parsed = engine.parseConfig(room.gameConfigs.get(gameId));
    } catch (ConfigValidationException e) {
      return Optional.of(e.getMessage() != null ? e.getMessage() : "Configuración inválida.");
    }
    var staticReason = GameConfigReadiness.validate(gameId, toTree(parsed), readinessContext(room));
    if (staticReason.isPresent()) return staticReason;
    return engine.checkAvailability(parsed, context(room, catalogSnapshot()));
  }

  private GameConfigReadiness.Context readinessContext(LiveRoom room) {
    return new GameConfigReadiness.Context(hostCustomCategories(room).size(), hostWouldYouRatherPrompts(room).size());
  }

  private void assertRotationReady(LiveRoom room, boolean continuing) {
    var mode = room.gameSelectionMode;
    if (mode instanceof GameSelectionMode.Fixed) return;
    var gameIds = GameSelectionMode.gameIdsOf(mode);
    for (var gameId : gameIds) {
      var module = registry.get(gameId).orElseThrow(() -> new RoomException("Minijuego desconocido: " + gameId));
      if (!registry.isPorted(gameId)) throw new RoomException(NOT_PORTED);
      var configReason = gameConfigReadinessReason(room, gameId);
      if (configReason.isPresent()) throw new RoomException(module.name() + ": " + configReason.get());
    }
    int playableCount = playableGameIds(room, gameIds).size();
    boolean vote = mode instanceof GameSelectionMode.Vote;
    int minimum = vote ? 3 : continuing ? 1 : 2;
    if (playableCount < minimum) {
      throw new RoomException("La rotación " + (vote ? "por votación" : "aleatoria") + " necesita al menos " + minimum
          + " minijuegos compatibles con el número actual de jugadores.");
    }
  }

  private void selectRandomGame(LiveRoom room) {
    if (!(room.gameSelectionMode instanceof GameSelectionMode.Random mode)) return;
    var playable = playableGameIds(room, mode.gameIds());
    if (playable.isEmpty()) throw new RoomException("Ningún minijuego aleatorio admite el número actual de jugadores.");
    var alternatives = playable.stream().filter(gameId -> !gameId.equals(room.selectedGameId)).toList();
    room.selectedGameId = randomItem(alternatives.isEmpty() ? playable : alternatives);
  }

  public void startGame(String playerId) {
    inRequiredRoom(playerId, ignored -> {
      var room = permissionRoom(playerId, RoomPermission.START_GAME);
      assertLobby(room);
      var pendingNames = room.members.values().stream()
          .filter(member -> member.presence == PresenceStatus.CONNECTED && !member.identity.id().equals(room.hostId)
              && !member.ready)
          .map(member -> member.identity.displayName()).toList();
      if (!pendingNames.isEmpty()) {
        throw new RoomException("Falta por confirmar: " + RoomTexts.formatPendingReadyNames(pendingNames) + ".");
      }
      assertRotationReady(room, false);
      selectRandomGame(room);
      launchGame(room);
      return null;
    });
  }

  void launchGame(LiveRoom room) {
    var players = room.members.values().stream().filter(member -> member.presence == PresenceStatus.CONNECTED)
        .map(member -> new GamePlayer(member.identity.id(), member.identity.displayName(), true, true)).toList();
    var module = registry.get(room.selectedGameId).orElseThrow(() -> new RoomException("Unknown game"));
    var engine = engine(room.selectedGameId)
        .orElseThrow(() -> new RoomException(NOT_PORTED));
    if (players.size() < module.minPlayers()) {
      throw new RoomException("Se necesitan al menos " + module.minPlayers() + " jugadores.");
    }
    if (module.maxPlayers() != null && players.size() > module.maxPlayers()) {
      throw new RoomException("Este juego admite un máximo de " + module.maxPlayers() + " jugadores.");
    }
    var catalog = catalogSnapshot();
    var context = contextBuilder(catalog)
        .players(players)
        .now(clock.now())
        .roomCode(room.code)
        .hostId(room.hostId)
        .hostCustomCategories(hostCustomCategories(room))
        .hostWouldYouRatherPrompts(hostWouldYouRatherPrompts(room))
        .build();
    var config = engine.parseConfig(room.gameConfigs.get(room.selectedGameId));
    var configTree = toTree(config);
    var configReason = GameConfigReadiness.validate(module.id(), configTree, new GameConfigReadiness.Context(
        context.hostCustomCategories().size(), context.hostWouldYouRatherPrompts().size()));
    if (configReason.isPresent()) throw new RoomException(module.name() + ": " + configReason.get());
    var availabilityReason = engine.checkAvailability(config, context);
    if (availabilityReason.isPresent()) throw new RoomException(module.name() + ": " + availabilityReason.get());
    var state = engine.createInitialState(config, context);
    state = engine.start(state, context);
    for (var member : room.members.values()) {
      member.role = member.presence == PresenceStatus.CONNECTED ? MemberRole.PLAYER : MemberRole.SPECTATOR;
      member.ready = false;
    }
    var resultId = random.uuid();
    var auditReady = track(audit.gameStarted(new GameStarted(resultId, room.historyId, room.code, module.id(),
        players.size(), configTree, context.now())), null);
    room.game = new GameRuntime(catalog, resultId, module.id(), players.stream().map(GamePlayer::id).toList(), engine,
        config, configTree, state, context.now(), auditReady);
    resetWhoIsWhoCursors(room);
    room.phase = RoomPhase.of(engine.getLifecycle(state).phase());
    syncAndBroadcast(room);
  }

  // ---------------------------------------------------------------------------------------------- partida

  /**
   * {@code game:action}: comprueba la instancia y la época del sobre ({@code bind} en Node) y aplica la acción.
   * {@code payload} es el sobre crudo {@code { gameInstanceId, actionEpoch, action }}.
   */
  public void gameAction(String playerId, @Nullable JsonNode payload) {
    var request = RoomCommandParsers.gameActionRequest(payload);
    gameAction(playerId, request);
  }

  public void gameAction(String playerId, GameActionRequest request) {
    inRequiredRoom(playerId, room -> {
      var game = room.game;
      if (game == null || !game.resultId.equals(request.gameInstanceId())) {
        throw new RoomException("El minijuego ya ha cambiado.");
      }
      if (!game.engine.getLifecycle(game.state).actionEpoch().equals(request.actionEpoch())) {
        throw new RoomException("La ronda o el turno ya ha cambiado.");
      }
      action(playerId, request.action());
      return null;
    });
  }

  /** La mutación síncrona es la sección crítica de la sala: nada se interpone antes de confirmar una selección. */
  void action(String playerId, @Nullable JsonNode payload) {
    inRequiredRoom(playerId, room -> {
      var game = room.game;
      if (game == null || game.finishReason != null) throw new RoomException("No game in progress");
      var member = room.members.get(playerId);
      if (member == null || member.presence != PresenceStatus.CONNECTED || member.role != MemberRole.PLAYER) {
        throw new RoomException("You cannot act in the current game");
      }
      var context = context(room);
      var action = game.engine.parseAction(payload);
      var lifecycle = game.engine.getLifecycle(game.state);
      var previousEpoch = lifecycle.actionEpoch();
      if (lifecycle.nextDeadline() != null && context.now() >= lifecycle.nextDeadline()) {
        game.state = game.engine.handleTimeout(game.state, context);
        if (!game.engine.getLifecycle(game.state).actionEpoch().equals(previousEpoch)
            || game.engine.isFinished(game.state)) {
          if (game.engine.hasCursorChannel()) resetWhoIsWhoCursors(room);
          syncAndBroadcast(room, game);
          throw new RoomException("El tiempo ha terminado; la fase o el turno ha cambiado.");
        }
      }
      var result = game.engine.handleAction(game.state, playerId, action, context);
      game.state = result.state();
      if (game.engine.hasCursorChannel() && (!game.engine.getLifecycle(game.state).actionEpoch().equals(previousEpoch)
          || game.engine.isFinished(game.state))) {
        resetWhoIsWhoCursors(room);
      }
      syncAndBroadcast(room, game);
      if (!result.accepted()) throw new RoomException(result.error() != null ? result.error() : "Action rejected");
      return null;
    });
  }

  /** {@code game:skip-vote:set}; {@code payload} crudo {@code { gameInstanceId, wantsToSkip }}. */
  public void setGameSkipVote(String playerId, @Nullable JsonNode payload) {
    var request = RoomCommandParsers.setGameSkipVoteRequest(payload);
    inRequiredRoom(playerId, room -> {
      var game = room.game;
      if (game == null || game.finishReason != null || room.phase == RoomPhase.GAME_RESULTS) {
        throw new RoomException("No hay un minijuego activo que se pueda saltar.");
      }
      if (!game.resultId.equals(request.gameInstanceId())) throw new RoomException("El minijuego ya ha cambiado.");
      var member = room.members.get(playerId);
      var eligibleIds = GameSkip.eligibleVoterIds(room);
      if (member == null || member.presence != PresenceStatus.CONNECTED || !eligibleIds.contains(playerId)) {
        throw new RoomException("No puedes votar para saltar este minijuego.");
      }
      if (request.wantsToSkip()) game.skipVoterIds.add(playerId);
      else game.skipVoterIds.remove(playerId);
      if (!resolveUnanimousGameSkip(room, game, eligibleIds)) broadcast(room);
      return null;
    });
  }

  boolean resolveUnanimousGameSkip(LiveRoom room, GameRuntime game) {
    return resolveUnanimousGameSkip(room, game, GameSkip.reconcileVotes(room));
  }

  private boolean resolveUnanimousGameSkip(LiveRoom room, GameRuntime game, List<String> eligibleIds) {
    if (room.game != game || game.finishReason != null || !GameSkip.hasUnanimousSkip(room, eligibleIds)) return false;
    return skipGame(room, game);
  }

  private boolean claimGameFinish(LiveRoom room, GameRuntime game, GameFinishReason reason) {
    if (room.game != game || game.finishReason != null) return false;
    game.finishReason = reason;
    room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
    return true;
  }

  private boolean skipGame(LiveRoom room, GameRuntime game) {
    if (!claimGameFinish(room, game, GameFinishReason.SKIPPED)) return false;
    resetWhoIsWhoCursors(room);
    game.skipVoterIds.clear();
    long endedAt = clock.now();
    pending.track(game.auditReady.exceptionally(error -> logged("Failed to persist game start", error))
        .thenCompose(ignored -> audit.gameAbandoned(new GameAbandoned(game.resultId, "SKIPPED", endedAt)))
        .exceptionally(error -> logged("Failed to mark skipped game as abandoned", error)));
    try {
      advanceSessionAfterGame(room);
    } catch (RuntimeException error) {
      broadcast(room);
      LOG.error("Failed to continue after skipped game", error);
    }
    return true;
  }

  private List<String> eligibleNextGameVoterIds(LiveRoom room) {
    return room.members.values().stream().filter(member -> member.presence == PresenceStatus.CONNECTED)
        .map(member -> member.identity.id()).toList();
  }

  boolean beginNextGameVote(LiveRoom room) {
    if (!(room.gameSelectionMode instanceof GameSelectionMode.Vote mode)) return false;
    var options = shuffled(playableGameIds(room, mode.gameIds()));
    var optionGameIds = options.subList(0, Math.min(3, options.size()));
    if (optionGameIds.size() < 3) return false;
    room.nextGameVote = new NextGameVote(optionGameIds, clock.now() + NEXT_GAME_VOTE_MS);
    room.phase = RoomPhase.NEXT_GAME_VOTE;
    return true;
  }

  private void resolveNextGameVote(LiveRoom room) {
    var vote = room.nextGameVote;
    if (vote == null || room.phase != RoomPhase.NEXT_GAME_VOTE) return;
    var tallies = new LinkedHashMap<String, Integer>();
    for (var gameId : vote.optionGameIds) tallies.put(gameId, 0);
    for (var gameId : vote.votes.values()) tallies.merge(gameId, 1, Integer::sum);
    var playable = playableGameIds(room, vote.optionGameIds);
    if (playable.isEmpty()) {
      resetToLobby(room, false);
      return;
    }
    int maximum = playable.stream().mapToInt(gameId -> tallies.getOrDefault(gameId, 0)).max().orElse(0);
    var tiedGameIds = playable.stream().filter(gameId -> Objects.equals(tallies.get(gameId), maximum)).toList();
    var resolvedGameId = randomItem(tiedGameIds);
    vote.endsAt = null;
    vote.resolvedGameId = resolvedGameId;
    vote.tallies = tallies;
    vote.nextTransitionAt = clock.now() + NEXT_GAME_VOTE_RESULT_MS;
    room.selectedGameId = resolvedGameId;
    room.phase = RoomPhase.NEXT_GAME_VOTE_RESULTS;
  }

  public void voteNextGame(String playerId, @Nullable String gameId) {
    inRequiredRoom(playerId, room -> {
      var vote = room.nextGameVote;
      if (vote == null || room.phase != RoomPhase.NEXT_GAME_VOTE) {
        throw new RoomException("No hay una votación de minijuegos activa.");
      }
      var member = room.members.get(playerId);
      if (member == null || member.presence != PresenceStatus.CONNECTED) {
        throw new RoomException("No puedes votar en este momento.");
      }
      if (vote.endsAt != null && clock.now() >= vote.endsAt) {
        resolveNextGameVote(room);
        broadcast(room);
        schedule(room);
        throw new RoomException("La votación ha terminado.");
      }
      if (gameId == null || !vote.optionGameIds.contains(gameId)) {
        throw new RoomException("Ese minijuego no es una opción válida.");
      }
      var manifest = registry.get(gameId).orElse(null);
      if (manifest == null || !ManifestView.supportsPlayerCount(manifest, connectedPlayerCount(room))) {
        throw new RoomException("Ese minijuego ya no admite el número actual de jugadores.");
      }
      if (vote.votes.containsKey(playerId)) throw new RoomException("Tu voto ya está bloqueado.");
      vote.votes.put(playerId, gameId);
      var eligibleIds = eligibleNextGameVoterIds(room);
      if (vote.votes.keySet().containsAll(eligibleIds)) resolveNextGameVote(room);
      broadcast(room);
      schedule(room);
      return null;
    });
  }

  void tick(LiveRoom room) {
    if (room.phase == RoomPhase.NEXT_GAME_VOTE) {
      resolveNextGameVote(room);
      broadcast(room);
      schedule(room);
      return;
    }
    if (room.phase == RoomPhase.NEXT_GAME_VOTE_RESULTS) {
      resetToLobby(room, false);
      try {
        launchGame(room);
      } catch (RuntimeException error) {
        broadcast(room);
        schedule(room);
      }
      return;
    }
    if (room.phase == RoomPhase.LOBBY || room.phase == RoomPhase.GAME_RESULTS
        || room.phase == RoomPhase.SESSION_RESULTS) {
      return;
    }
    var game = room.game;
    if (game == null || game.finishReason != null) return;
    var previousEpoch = game.engine.getLifecycle(game.state).actionEpoch();
    game.state = game.engine.handleTimeout(game.state, context(room));
    if (game.engine.hasCursorChannel() && (!game.engine.getLifecycle(game.state).actionEpoch().equals(previousEpoch)
        || game.engine.isFinished(game.state))) {
      resetWhoIsWhoCursors(room);
    }
    syncAndBroadcast(room, game);
  }

  private void applyPresenceChange(LiveRoom room) {
    if (room.phase == RoomPhase.LOBBY || room.phase == RoomPhase.GAME_RESULTS
        || room.phase == RoomPhase.SESSION_RESULTS) {
      broadcast(room);
      return;
    }
    if (room.nextGameVote != null) {
      if (room.phase == RoomPhase.NEXT_GAME_VOTE) {
        var eligibleIds = eligibleNextGameVoterIds(room);
        if (room.nextGameVote.votes.keySet().containsAll(eligibleIds)) resolveNextGameVote(room);
      }
      broadcast(room);
      schedule(room);
      return;
    }
    var game = room.game;
    if (game != null && game.finishReason == null && resolveUnanimousGameSkip(room, game)) return;
    if (game != null && game.engine.hasPresenceHandler()) {
      game.state = game.engine.handlePresenceChange(game.state, context(room));
      syncAndBroadcast(room, game);
      return;
    }
    broadcast(room);
  }

  private void syncAndBroadcast(LiveRoom room) {
    syncAndBroadcast(room, room.game);
  }

  void syncAndBroadcast(LiveRoom room, @Nullable GameRuntime expectedGame) {
    var game = expectedGame;
    if (game == null || room.game != game || game.finishReason != null) return;
    var lifecycle = game.engine.getLifecycle(game.state);
    room.phase = RoomPhase.of(lifecycle.phase());
    var spectators = new HashSet<>(lifecycle.spectatorIds());
    for (var member : room.members.values()) {
      if (spectators.contains(member.identity.id())) member.role = MemberRole.SPECTATOR;
    }
    if (game.engine.isFinished(game.state) && !game.resultsApplied) finishGame(room, game);
    broadcast(room);
    schedule(room);
  }

  private void finishGame(LiveRoom room, GameRuntime game) {
    if (!claimGameFinish(room, game, GameFinishReason.COMPLETED)) return;
    resetWhoIsWhoCursors(room);
    game.skipVoterIds.clear();
    game.resultsApplied = true;
    room.gamesPlayed += 1;
    var gameResults = game.engine.getResults(game.state);
    var sessionPoints = Scoring.sessionPointsForResults(gameResults);
    for (var standing : gameResults.standings()) {
      var member = room.members.get(standing.playerId());
      int points = sessionPoints.getOrDefault(standing.playerId(), 0);
      if (member != null) member.sessionPoints += points;
      var participant = room.sessionParticipants.get(standing.playerId());
      if (participant == null && member != null) {
        participant = new SessionParticipant(member.identity, 0);
        room.sessionParticipants.put(standing.playerId(), participant);
      }
      if (participant != null) participant.sessionPoints += points;
    }
    var rawPoints = new LinkedHashMap<String, Integer>();
    for (var standing : gameResults.standings()) rawPoints.put(standing.playerId(), standing.points());
    room.sessionHistory.add(new SessionGameSummary(room.gamesPlayed, game.gameId,
        gameResults.standings().stream()
            .filter(standing -> standing.won() != null ? standing.won() : standing.position() == 1)
            .map(standing -> standing.playerId()).toList(),
        Scoring.SESSION_SCORING_VERSION, sessionPoints, rawPoints));
    if (room.sessionHistory.size() > MAX_SESSION_HISTORY) {
      room.sessionHistory.subList(0, room.sessionHistory.size() - MAX_SESSION_HISTORY).clear();
    }
    room.phase = RoomPhase.GAME_RESULTS;
    // La sesión puede avanzar antes de que termine la auditoría asíncrona del arranque.
    var identities = new LinkedHashMap<String, AuthUser>();
    for (var entry : room.members.entrySet()) identities.put(entry.getKey(), entry.getValue().identity);
    var resultRoom = new GameResultsPersister.ResultRoomSnapshot(room.historyId, room.code, identities);
    var resultSnapshot = copyResults(gameResults);
    pending.track(game.auditReady.exceptionally(error -> logged("Failed to persist game start", error))
        .thenCompose(ignored -> results.persist(resultRoom, resultSnapshot, game.resultId, game.startedAt, game.gameId,
            game.configTree))
        .exceptionally(error -> logged("Failed to persist game results", error)));
  }

  // ------------------------------------------------------------------------------------------------ cursores

  /** {@code who-is-who:cursor}: valida la conexión vigente y reenvía a los compañeros del canal. */
  public void updateWhoIsWhoCursor(String playerId, String connectionId, @Nullable JsonNode payload) {
    inRequiredRoom(playerId, room -> {
      assertActiveSocket(room, playerId, connectionId);
      cursors.update(room, playerId, payload);
      return null;
    });
  }

  /** {@code who-is-who:cursor-clear}. */
  public void clearWhoIsWhoCursor(String playerId, String connectionId) {
    inOptionalRoom(playerId, room -> {
      if (room == null) return null;
      assertActiveSocket(room, playerId, connectionId);
      cursors.clear(room, playerId);
      return null;
    });
  }

  private void clearWhoIsWhoCursor(LiveRoom room, String playerId) {
    if (store.roomForPlayer(playerId) == room) cursors.clear(room, playerId);
  }

  private void resetWhoIsWhoCursors(LiveRoom room) {
    cursors.reset(room);
  }

  // --------------------------------------------------------------------------------------- resultados y sesión

  private void resetToLobby(LiveRoom room, boolean resetSession) {
    room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
    var iterator = room.members.entrySet().iterator();
    while (iterator.hasNext()) {
      var entry = iterator.next();
      var member = entry.getValue();
      if (member.presence == PresenceStatus.LEFT) {
        iterator.remove();
        store.detachPlayer(entry.getKey(), room.code);
        continue;
      }
      member.role = MemberRole.PLAYER;
      member.ready = false;
      if (resetSession) member.sessionPoints = 0;
    }
    if (resetSession) {
      room.gamesPlayed = 0;
      room.sessionHistory = new ArrayList<>();
      var participants = new LinkedHashMap<String, SessionParticipant>();
      for (var member : room.members.values()) {
        participants.put(member.identity.id(), new SessionParticipant(member.identity, 0));
      }
      room.sessionParticipants = participants;
    }
    room.game = null;
    room.nextGameVote = null;
    room.phase = RoomPhase.LOBBY;
  }

  public void returnLobby(String playerId) {
    inRequiredRoom(playerId, ignored -> {
      var room = permissionRoom(playerId, RoomPermission.START_GAME);
      if (room.phase != RoomPhase.GAME_RESULTS && room.phase != RoomPhase.SESSION_RESULTS) {
        throw new RoomException("Game has not finished");
      }
      boolean resetSession = room.phase == RoomPhase.SESSION_RESULTS;
      resetToLobby(room, resetSession);
      broadcast(room);
      return null;
    });
  }

  public void continueSession(String playerId) {
    inRequiredRoom(playerId, ignored -> {
      var room = permissionRoom(playerId, RoomPermission.START_GAME);
      if (room.phase != RoomPhase.GAME_RESULTS) throw new RoomException("La partida todavía no ha terminado.");
      try {
        advanceSessionAfterGame(room);
        return null;
      } catch (RuntimeException error) {
        broadcast(room);
        throw error;
      }
    });
  }

  private void advanceSessionAfterGame(LiveRoom room) {
    if (SessionMode.isComplete(room.sessionMode, room.gamesPlayed,
        room.sessionParticipants.values().stream().map(participant -> participant.sessionPoints).toList())) {
      room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
      room.game = null;
      room.nextGameVote = null;
      room.phase = RoomPhase.SESSION_RESULTS;
      broadcast(room);
      return;
    }
    resetToLobby(room, false);
    if (room.gameSelectionMode instanceof GameSelectionMode.Vote) {
      beginNextGameVote(room);
      broadcast(room);
      schedule(room);
      return;
    }
    assertRotationReady(room, true);
    selectRandomGame(room);
    launchGame(room);
  }

  public void endSession(String playerId) {
    inRequiredRoom(playerId, ignored -> {
      var room = permissionRoom(playerId, RoomPermission.END_SESSION);
      if (room.phase != RoomPhase.LOBBY && room.phase != RoomPhase.GAME_RESULTS
          && room.phase != RoomPhase.NEXT_GAME_VOTE && room.phase != RoomPhase.NEXT_GAME_VOTE_RESULTS) {
        throw new RoomException("Cannot end the session during a game");
      }
      room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
      room.nextGameVote = null;
      room.phase = RoomPhase.SESSION_RESULTS;
      broadcast(room);
      return null;
    });
  }

  void schedule(LiveRoom room) {
    room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
    if (room.phase == RoomPhase.NEXT_GAME_VOTE || room.phase == RoomPhase.NEXT_GAME_VOTE_RESULTS) {
      var vote = room.nextGameVote;
      Long deadline = vote == null ? null : room.phase == RoomPhase.NEXT_GAME_VOTE ? vote.endsAt : vote.nextTransitionAt;
      if (deadline != null) scheduleCurrent(room, deadline);
      return;
    }
    var game = room.game;
    if (game == null || room.phase == RoomPhase.GAME_RESULTS || room.phase == RoomPhase.SESSION_RESULTS) return;
    var deadline = game.engine.getLifecycle(game.state).nextDeadline();
    if (deadline == null) return;
    scheduleCurrent(room, deadline);
  }

  /** {@code scheduleDeadline(deadline, callback)} con la guardia de identidad {@code room.transitionTimer !== timer}. */
  private void scheduleCurrent(LiveRoom room, long deadline) {
    var timer = new RoomTimer();
    room.transitionTimer = timer;
    long delay = Math.max(0, deadline - clock.now() + DEADLINE_TOLERANCE_MS);
    timer.bind(schedulers.schedule(delay, () -> timerCallback(room, () -> {
      if (room.transitionTimer != timer) return;
      room.transitionTimer = null;
      tick(room);
    })));
  }

  // ------------------------------------------------------------------------------------------ contexto y vistas

  GameContext context(LiveRoom room) {
    return context(room, room.game != null ? room.game.catalog : catalogSnapshot());
  }

  private GameContext context(LiveRoom room, GameCatalogSnapshot catalog) {
    var players = room.members.values().stream().map(member -> new GamePlayer(member.identity.id(),
        member.identity.displayName(), member.presence == PresenceStatus.CONNECTED,
        member.role == MemberRole.PLAYER && member.presence != PresenceStatus.LEFT)).toList();
    return contextBuilder(catalog)
        .players(players)
        .now(clock.now())
        .roomCode(room.code)
        .hostId(room.hostId)
        .hostCustomCategories(hostCustomCategories(room))
        .hostWouldYouRatherPrompts(hostWouldYouRatherPrompts(room))
        .build();
  }

  /** Catálogos fijados más la precarga de imágenes ({@code preloadGameImage} de Node). */
  private GameContext.Builder contextBuilder(GameCatalogSnapshot catalog) {
    return GameContext.builder(catalog.pokemon(), random::next)
        .pokemonVisuals(catalog.visuals())
        .pokemonAudio(catalog.audio())
        .preloadImage(assets::preload);
  }

  private List<SubjectiveCategory> hostCustomCategories(LiveRoom room) {
    var host = room.members.get(room.hostId);
    return host != null && host.identity.kind() == AuthUser.Kind.USER
        ? hostContent.customCategoriesForUser(host.identity.id()) : List.of();
  }

  private List<WouldYouRatherPromptPair> hostWouldYouRatherPrompts(LiveRoom room) {
    var host = room.members.get(room.hostId);
    return host != null && host.identity.kind() == AuthUser.Kind.USER
        ? hostContent.wouldYouRatherPromptsForUser(host.identity.id()) : List.of();
  }

  /** Imagen opaca de una ronda; vacío si la sala, la partida o el motor no la resuelven. */
  public Optional<AssetResolution> gameAsset(String code, String assetToken, int roundNumber, String assetId) {
    var room = store.get(code);
    if (room == null) return Optional.empty();
    return locked(room, () -> {
      var game = room.game;
      if (store.get(code) != room || game == null) return Optional.empty();
      return game.engine.resolveAsset(game.state, new AssetRequest(assetToken, roundNumber, assetId), context(room));
    });
  }

  public List<AdminActiveRoom> adminRooms() {
    var rooms = new ArrayList<AdminActiveRoom>();
    for (var room : store.list()) {
      rooms.add(locked(room, () -> {
        var host = room.members.get(room.hostId);
        var liveGame = room.game != null && room.game.finishReason == null ? room.game : null;
        var manifest = liveGame == null ? null : registry.get(liveGame.gameId).orElse(null);
        var participants = room.members.values().stream().map(member -> new AdminActiveRoom.Participant(
            member.identity.id(), member.identity.displayName(), member.identity.kind(), member.presence,
            member.roomRole)).toList();
        return new AdminActiveRoom(room.historyId, room.code, room.phase, liveGame == null ? null : liveGame.gameId,
            manifest == null ? null : manifest.name(),
            (int) participants.stream().filter(p -> p.presence() == PresenceStatus.CONNECTED).count(),
            (int) participants.stream().filter(p -> p.presence() != PresenceStatus.LEFT).count(),
            room.maxPlayers, host != null ? host.identity.displayName() : "Sin host",
            IsoTimestamps.millis(Instant.ofEpochMilli(room.createdAt)),
            IsoTimestamps.millis(Instant.ofEpochMilli(room.updatedAt)), participants);
      }));
    }
    return rooms;
  }

  /** {@code view(room, playerId)}: proyección pública más la privada de {@code playerId}. */
  RoomView view(LiveRoom room, String playerId) {
    var context = context(room);
    return views.view(room, playerId, views.publicView(room, context, hostCustomCategories(room).size(),
        hostWouldYouRatherPrompts(room).size()), context);
  }

  void broadcast(LiveRoom room) {
    room.revision += 1;
    room.updatedAt = clock.now();
    views.broadcast(room, context(room), hostCustomCategories(room).size(), hostWouldYouRatherPrompts(room).size());
  }

  private LiveRoom requiredRoom(String playerId) {
    var room = store.roomForPlayer(playerId);
    if (room == null) throw new RoomException("Not in a room");
    return room;
  }

  private LiveRoom permissionRoom(String playerId, RoomPermission permission) {
    var room = requiredRoom(playerId);
    var member = room.members.get(playerId);
    if (member == null || !RoomPermission.has(member.roomRole, permission)) {
      throw new RoomException("No tienes permiso para realizar esta acción.");
    }
    return room;
  }

  private static void assertLobby(LiveRoom room) {
    if (room.phase != RoomPhase.LOBBY) throw new RoomException("This setting can only be changed in the lobby");
  }

  // ------------------------------------------------------------------------------------------- infraestructura

  private String roomCode() {
    return RoomCodes.generate(random::nextInt);
  }

  /** {@code structuredClone(results)}: la persistencia asíncrona nunca comparte mapas mutables con el motor. */
  private static GameResults copyResults(GameResults source) {
    return new GameResults(source.winnerId(), source.standings().stream().map(standing -> new GameStanding(
        standing.playerId(), standing.position(), standing.points(), standing.won(),
        new LinkedHashMap<String, Number>(standing.stats()))).toList());
  }

  private Optional<ErasedEngine> engine(@Nullable String gameId) {
    return gameId == null ? Optional.empty() : Optional.ofNullable(engines.get(gameId));
  }

  private static boolean isInteger(double value) {
    return Double.isFinite(value) && value == Math.rint(value);
  }

  /** {@code configSchema.parse(raw)} para un juego portado; un juego sin motor guarda su configuración tal cual. */
  private JsonNode normalizedConfig(GameManifest manifest, JsonNode raw) {
    var engine = engines.get(manifest.id());
    return engine != null ? toTree(engine.parseConfig(raw)) : raw;
  }

  private JsonNode toTree(@Nullable Object value) {
    if (value == null) return JsonNode.nullNode();
    if (value instanceof JsonNode node) return node;
    try {
      return json.writeValueToTree(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private <T> CompletableFuture<T> track(CompletableFuture<T> task, @Nullable String failure) {
    if (failure != null) {
      pending.track(task.exceptionally(error -> logged(failure, error)));
      return task;
    }
    return pending.track(task);
  }

  private static <T> T logged(String message, Throwable error) {
    LOG.error(message, error);
    return null;
  }

  /** Callback de temporizador: re-entra por el lock de la sala y registra cualquier fallo (nunca lo propaga al hilo). */
  private void timerCallback(LiveRoom room, Runnable callback) {
    try {
      locked(room, () -> {
        callback.run();
        return null;
      });
    } catch (RuntimeException error) {
      LOG.error("Room timer failed for {}", room.code, error);
    }
  }

  /** Ejecuta {@code operation} con el lock de {@code room}; los errores del motor se vuelven {@link RoomException}. */
  private <T> T locked(LiveRoom room, Supplier<T> operation) {
    room.lock.lock();
    try {
      return engineErrors(operation);
    } finally {
      room.lock.unlock();
    }
  }

  /**
   * Toma el lock de la sala actual de {@code playerId} y revalida la pertenencia; {@code null} si no está en ninguna.
   * Mientras se tiene el lock, la asociación del jugador con esa sala no puede cambiar desde otro hilo.
   */
  private <T> T inOptionalRoom(String playerId, Function<LiveRoom, T> operation) {
    while (true) {
      var room = store.roomForPlayer(playerId);
      if (room == null) return engineErrors(() -> operation.apply(null));
      room.lock.lock();
      try {
        if (store.roomForPlayer(playerId) != room) continue;
        return engineErrors(() -> operation.apply(room));
      } finally {
        room.lock.unlock();
      }
    }
  }

  private <T> T inRequiredRoom(String playerId, Function<LiveRoom, T> operation) {
    return inOptionalRoom(playerId, room -> {
      if (room == null) throw new RoomException("Not in a room");
      return operation.apply(room);
    });
  }

  private static <T> T engineErrors(Supplier<T> operation) {
    try {
      return operation.get();
    } catch (EngineException e) {
      throw new RoomException(e.getMessage());
    }
  }
}

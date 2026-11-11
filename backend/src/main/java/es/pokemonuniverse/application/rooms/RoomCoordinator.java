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
import es.pokemonuniverse.domain.game.engine.EngineException;
import es.pokemonuniverse.domain.game.engine.GameContext;
import es.pokemonuniverse.domain.game.engine.GamePlayer;
import es.pokemonuniverse.domain.game.engine.GameResults;
import es.pokemonuniverse.domain.game.engine.GameStanding;
import es.pokemonuniverse.domain.game.engine.SubjectiveCategory;
import es.pokemonuniverse.domain.game.engine.WouldYouRatherPromptPair;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.progression.Experience;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import es.pokemonuniverse.domain.room.ChatFilter;
import es.pokemonuniverse.domain.room.DailyRoom;
import es.pokemonuniverse.domain.room.ErasedEngine;
import es.pokemonuniverse.domain.room.GameCatalogSnapshot;
import es.pokemonuniverse.domain.room.GameFinishReason;
import es.pokemonuniverse.domain.room.GameModes;
import es.pokemonuniverse.domain.room.GamePick;
import es.pokemonuniverse.domain.room.GameRuntime;
import es.pokemonuniverse.domain.room.GameSelectionMode;
import es.pokemonuniverse.domain.room.GameSkip;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.MemberRole;
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
import es.pokemonuniverse.domain.tcg.TcgCardCatalog;
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
import java.util.function.DoubleSupplier;
import java.util.function.Function;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Coordinador autoritativo de salas: crea y cierra salas, aplica los comandos de los jugadores y sus temporizadores.
 *
 * <p>Concurrencia: las salas se mutan desde varios hilos (conexiones y temporizadores), así que cada
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

  /** Comandos de lobby y de sesión en una sala del reto diario. */
  public static final String DAILY_UNAVAILABLE = "Not available in the daily challenge";
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
  private final RoomChatCommands chat;
  final GameRotation rotation;
  final NextGameVoting voting;
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
  private final @Nullable TcgCardCatalog tcgCards;
  private final Map<String, JsonNode> defaultConfigs = new LinkedHashMap<>();
  /** Motores con los tipos borrados, uno por juego. */
  private final Map<String, ErasedEngine> engines = new LinkedHashMap<>();
  /** Experiencia de las cuentas al entrar (nivel del avatar); sin BD, ninguna. */
  private final UserExperienceReader experience;
  /** Presencia de amigos: escucha los cambios de sala. */
  private final RoomActivity activity;
  /** Partidas del reto diario; sin él, nadie las registra. */
  private final DailyRunListener dailyRuns;

  /**
   * {@code tcgCards}: el catálogo TCG en memoria que comparten todas las salas (no se fija por partida: Node pasa la
   * misma instancia, cuyo {@code refresh} sustituye la lista). Sin BD no hay catálogo y {@code tcg-higher-lower}
   * responde con su literal de no disponibilidad. Ninguno de los cuatro últimos depende del coordinador (la presencia de
   * amigos lo pide a través de un {@code BeanProvider}), así que entran por el constructor sin ciclos.
   */
  @Inject
  public RoomCoordinator(GameRegistry registry, JsonMapper json, RoomEvents events, RoomAuditSink audit,
      GameResultsPersister results, UserGameConfigPreferences userGameConfigs, HostContentProvider hostContent,
      Clock clock, RandomSource random, RoomSchedulers schedulers, RoomSettings settings,
      GameCatalogProvider catalog, GameAssetService assets, @Nullable TcgCardCatalog tcgCards,
      UserExperienceReader experience, ChatFilter chatFilter, RoomActivity activity,
      @Nullable DailyRunListener dailyRuns) {
    this.tcgCards = tcgCards;
    this.experience = experience;
    this.activity = activity;
    this.dailyRuns = dailyRuns != null ? dailyRuns : DailyRunListener.NONE;
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
    this.chat = new RoomChatCommands(events, clock, chatFilter);
    this.rotation = new GameRotation(registry, engines, random, this::toTree, this::readinessContext,
        room -> context(room, catalogSnapshot()));
    this.voting = new NextGameVoting(registry, rotation, clock, room -> resetToLobby(room, false), room -> {
      broadcast(room);
      schedule(room);
    });
    this.views = new RoomViews(registry, defaultConfigs, clock, events, this::toTree);
    this.currentCatalog = snapshot(catalog.loadPokemonCatalog());
    for (var manifest : registry.list()) {
      defaultConfigs.put(manifest.id(), toTree(manifest.defaultConfig()));
      registry.engine(manifest.id()).ifPresent(engine -> engines.put(manifest.id(), new ErasedEngine(engine)));
    }
  }

  /** Catálogo de Pokémon vigente (el que usará la siguiente partida); de solo lectura. */
  public PokemonCatalog currentPokemonCatalog() {
    return currentCatalog.pokemon();
  }

  /**
   * Dónde está {@code playerId}. Toma el lock de la sala: quien avisó a {@link RoomActivity} lo hizo con el lock tomado,
   * así que esta lectura espera a que termine el cambio y ve el estado final. Una partida terminada (resultados de la
   * partida, de la sesión o votación de la siguiente) ya no está en curso: cuenta como {@code IN_ROOM}, igual que
   * {@code liveGame} en {@link #adminRooms()}. No llamar con el lock de otra sala tomado.
   */
  public RoomOccupancy occupancyOf(String playerId) {
    while (true) {
      var room = store.roomForPlayer(playerId);
      if (room == null) return RoomOccupancy.NONE;
      room.lock.lock();
      try {
        if (store.roomForPlayer(playerId) != room) continue; // cambió de sala mientras esperaba el lock
        var game = room.game;
        return game != null && game.finishReason == null ? RoomOccupancy.PLAYING : RoomOccupancy.IN_ROOM;
      } finally {
        room.lock.unlock();
      }
    }
  }

  /**
   * Resumen de la sala de {@code playerId} para invitar: código, quién está, plazas y minijuego. Toma el lock de la sala
   * solo para copiar campos en memoria (sin BD ni envíos) y lo suelta al volver. No llamar con el lock de otra sala
   * tomado.
   */
  public Optional<RoomSummary> roomOf(String playerId) {
    while (true) {
      var room = store.roomForPlayer(playerId);
      if (room == null) return Optional.empty();
      room.lock.lock();
      try {
        if (store.roomForPlayer(playerId) != room) continue; // cambió de sala mientras esperaba el lock
        if (room.daily != null) return Optional.empty(); // la sala del reto es privada: no se invita a ella
        var present = new HashSet<String>();
        room.members.forEach((id, member) -> {
          if (member.presence != PresenceStatus.LEFT) present.add(id);
        });
        var gameName = room.selectedGameId == null ? null
            : registry.get(room.selectedGameId).map(GameManifest::name).orElse(null);
        return Optional.of(new RoomSummary(room.code, present, room.members.keySet(), room.maxPlayers, gameName,
            room.phase == RoomPhase.LOBBY));
      } finally {
        room.lock.unlock();
      }
    }
  }

  /**
   * La partida del reto que tiene viva {@code userId}, si está en una sala del reto. Como {@link #roomOf}, toma el lock
   * de la sala solo para copiar campos; no llamar con el lock de otra sala tomado.
   */
  public Optional<DailyRunRef> dailyRunOf(String userId) {
    while (true) {
      var room = store.roomForPlayer(userId);
      if (room == null) return Optional.empty();
      room.lock.lock();
      try {
        if (store.roomForPlayer(userId) != room) continue; // cambió de sala mientras esperaba el lock
        var daily = room.daily;
        if (daily == null) return Optional.empty();
        var game = room.game;
        return Optional.of(new DailyRunRef(daily.date, daily.gameId, game == null || game.finishReason != null));
      } finally {
        room.lock.unlock();
      }
    }
  }

  /** Avisa a la presencia de las cuentas registradas de la sala; solo encola (se llama con el lock tomado). */
  private void roomActivity(LiveRoom room) {
    var ids = new ArrayList<String>();
    for (var member : room.members.values()) {
      if (member.identity.kind() == AuthUser.Kind.USER) ids.add(member.identity.id());
    }
    if (!ids.isEmpty()) activity.changed(List.copyOf(ids));
  }

  private void roomActivity(AuthUser identity) {
    if (identity.kind() == AuthUser.Kind.USER) activity.changed(List.of(identity.id()));
  }

  /** Se lee fuera del lock de la sala; un fallo solo deja al miembro sin nivel. */
  private @Nullable Integer experienceOf(AuthUser identity) {
    if (identity.kind() != AuthUser.Kind.USER) return null;
    try {
      return experience.xpOf(identity.id());
    } catch (RuntimeException error) {
      LOG.warn("Failed to read experience", error);
      return null;
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
        for (var member : room.members.values()) {
          member.disconnectTimer = RoomTimer.cancel(member.disconnectTimer);
          member.presenceGraceTimer = RoomTimer.cancel(member.presenceGraceTimer);
        }
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
   * Apertura de una conexión: devuelve {@code false} si el servidor se cierra (el transporte desconecta). No toca la
   * sala: una cuenta registrada abre el {@code /ws} en toda página (amigos), y solo {@link #attach} ocupa el asiento.
   */
  public boolean connect(AuthUser identity, String connectionId) {
    return !stopping;
  }

  /**
   * {@code session:attach}, el {@code bind(socket)} de Node: la conexión entra en la sesión de sala (la página está en
   * {@code /play} o {@code /room}). Si la identidad ya pertenece a una sala, esta pasa a ser su conexión vigente (gana la
   * última) y recibe {@code session:restored}. Devuelve {@code false} si el servidor se cierra.
   */
  public boolean attach(AuthUser identity, String connectionId) {
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
      throw new RoomException("Estás jugando en dos pestañas o dispositivos con esta cuenta. Recarga esta página para seguir jugando aquí.");
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
      chat.sendHistory(room, identity.id(), connectionId);
      applyPresenceChange(room);
      return null;
    });
  }

  // ------------------------------------------------------------------------------------------ entrar y salir

  /** {@code room:create}; {@code requestedMax} es el {@code maxPlayers} crudo del payload (ausente o {@code null}). */
  public RoomView create(AuthUser identity, String connectionId, @Nullable JsonNode requestedMax) {
    return engineErrors(() -> {
      if (store.roomForPlayer(identity.id()) != null) throw new RoomException("Already in a room");
      var xp = experienceOf(identity);
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
          // Los modos se marcan por sala («Modos que se juegan»): un modo guardado no pasa a la sala nueva, que
          // empieza en Clásico con el resto de ajustes guardados.
          if (stored != null && GameModes.hasModes(game.id())) stored = GameModes.withMode(stored, GameModes.CLASSIC);
          gameConfigs.put(game.id(), normalizedConfig(game, stored != null ? stored : defaultConfigs.get(game.id())));
        }
        var room = new LiveRoom(random.uuid(), code, identity.id(), maxPlayers, module.id(), gameConfigs, now);
        room.lock.lock();
        try {
          room.members.put(identity.id(), member(identity, connectionId, MemberRole.PLAYER, RoomRole.HOST));
          room.members.get(identity.id()).xp = xp;
          room.sessionParticipants.put(identity.id(), new SessionParticipant(identity, 0));
          if (!store.saveIfAbsent(room)) continue; // otra sala ocupó el código entre la comprobación y el guardado
          if (!store.attachUnlessInOtherRoom(identity.id(), code)) {
            store.delete(code);
            throw new RoomException("Already in a room");
          }
          track(audit.roomCreated(new RoomCreated(room.historyId, code,
              identity.kind() == AuthUser.Kind.USER ? identity.id() : null, identity.displayName(), maxPlayers, now)),
              "Failed to persist room creation");
          roomActivity(identity);
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
    var xp = experienceOf(identity);
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
          // La sala del reto no existe para otras cuentas; su jugador sí vuelve a entrar para reconectarse.
          if (room.daily != null && current == null) throw new RoomException("Room not found");
          if (current == null && room.members.size() >= room.maxPlayers) throw new RoomException("Room is full");
          if (!store.attachUnlessInOtherRoom(identity.id(), room.code)) {
            throw new RoomException("Leave your current room first");
          }
          if (current != null) {
            boolean expiredDuringGame = current.presence == PresenceStatus.LEFT && room.game != null;
            Presence.restoreMember(current, identity, connectionId);
            if (expiredDuringGame) current.role = MemberRole.SPECTATOR;
            if (current.xp == null) current.xp = xp;
          } else {
            room.members.put(identity.id(), member(identity, connectionId,
                room.phase == RoomPhase.LOBBY ? MemberRole.PLAYER : MemberRole.SPECTATOR, RoomRole.MEMBER));
            room.members.get(identity.id()).xp = xp;
          }
          var participant = room.sessionParticipants.get(identity.id());
          if (participant != null) participant.identity = identity;
          else room.sessionParticipants.put(identity.id(),
              new SessionParticipant(identity, current != null ? current.sessionPoints : 0));
          chat.sendHistory(room, identity.id(), connectionId);
          applyPresenceChange(room);
          roomActivity(identity);
          return view(room, identity.id());
        } finally {
          room.lock.unlock();
        }
      }
    });
  }

  /**
   * Reto diario: crea una sala privada de un jugador ({@code maxPlayers} 1, sesión de una partida) con el juego y la
   * configuración fija de {@code launch} y arranca la partida al momento, sin lobby. No audita la sala ni la partida.
   * Si el arranque falla, la sala desaparece sin avisar de abandono y la cuenta queda libre para reintentar.
   */
  public RoomView startDaily(AuthUser identity, String connectionId, DailyLaunch launch) {
    return engineErrors(() -> {
      if (store.roomForPlayer(identity.id()) != null) throw new RoomException("Leave your current room first");
      var daily = launch.daily();
      var xp = experienceOf(identity);
      while (true) {
        var code = roomCode();
        while (store.get(code) != null) code = roomCode();
        var room = new LiveRoom(random.uuid(), code, identity.id(), 1, daily.gameId,
            Map.of(daily.gameId, launch.config()), clock.now());
        room.daily = daily;
        room.sessionMode = new SessionMode.GameCount(1);
        room.lock.lock();
        try {
          room.members.put(identity.id(), member(identity, connectionId, MemberRole.PLAYER, RoomRole.HOST));
          room.members.get(identity.id()).xp = xp;
          room.sessionParticipants.put(identity.id(), new SessionParticipant(identity, 0));
          if (!store.saveIfAbsent(room)) continue; // otra sala ocupó el código entre la comprobación y el guardado
          if (!store.attachUnlessInOtherRoom(identity.id(), code)) {
            store.delete(code);
            throw new RoomException("Leave your current room first");
          }
          try {
            launchGame(room, launch);
          } catch (RuntimeException error) {
            room.game = null;
            store.detachPlayer(identity.id(), code);
            store.delete(code);
            throw error;
          }
          roomActivity(identity);
          return view(room, identity.id());
        } finally {
          room.lock.unlock();
        }
      }
    });
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

  /**
   * Cierre de la conexión {@code connectionId}: abre la gracia de reconexión si es la conexión vigente. Si la partida
   * viva declara {@code presenceGraceMs}, el motor sigue viendo al jugador conectado hasta que vence esa gracia; su
   * temporizador aplica entonces el cambio de presencia (antes, si la gracia de reconexión vence primero).
   */
  public void disconnect(String playerId, String connectionId) {
    if (stopping) return;
    inOptionalRoom(playerId, room -> {
      var member = room == null ? null : room.members.get(playerId);
      if (room == null || member == null || !Objects.equals(member.connectionId, connectionId)) return null;
      clearWhoIsWhoCursor(room, playerId);
      // La gracia se fija antes del primer applyPresenceChange: ese contexto ya debe ver al jugador conectado.
      member.disconnectedAt = clock.now();
      member.presenceGraceTimer = RoomTimer.cancel(member.presenceGraceTimer);
      var game = room.game;
      var graceMs = livePresenceGraceMs(room);
      if (game != null && graceMs != null) {
        var graceTimer = new RoomTimer();
        member.presenceGraceTimer = graceTimer;
        graceTimer.bind(schedulers.schedule(graceMs, () -> timerCallback(room, () -> {
          if (room.members.get(playerId) != member || member.presenceGraceTimer != graceTimer
              || member.presence != PresenceStatus.TEMPORARILY_DISCONNECTED || room.game != game
              || game.finishReason != null) {
            return;
          }
          member.presenceGraceTimer = null;
          applyPresenceChange(room);
        })));
      }
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
    if (room.daily != null) {
      closeDailyRoom(room, member);
      return;
    }
    clearWhoIsWhoCursor(room, playerId);
    Presence.markLeft(member);
    var game = room.game;
    if (game != null && game.finishReason == null && game.participantIds.contains(playerId)) {
      game.departedParticipantIds.add(playerId);
    }
    boolean retainedByLiveGame = Presence.gameRetainsPlayer(room, playerId);
    if (!retainedByLiveGame) room.members.remove(playerId);
    store.detachPlayer(playerId, room.code);
    roomActivity(member.identity);
    if (room.hostId.equals(playerId)) transferHost(room);
    if (room.members.values().stream().noneMatch(candidate -> candidate.presence != PresenceStatus.LEFT)) {
      room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
      store.delete(room.code);
      roomActivity(room);
      track(audit.roomClosed(new RoomClosed(room.historyId, explicit ? "EMPTY_AFTER_LEAVE" : "EMPTY_AFTER_TIMEOUT",
          room.game != null && room.game.finishReason == null ? room.game.resultId : null, clock.now())),
          "Failed to persist room closure");
      return;
    }
    applyPresenceChange(room);
  }

  /**
   * El jugador del reto sale (o vence su gracia): la sala se cierra sin auditoría. Con la partida a medias se avisa del
   * abandono; tras los resultados, no.
   */
  private void closeDailyRoom(LiveRoom room, RoomMember member) {
    var playerId = member.identity.id();
    clearWhoIsWhoCursor(room, playerId);
    Presence.markLeft(member);
    room.members.remove(playerId);
    store.detachPlayer(playerId, room.code);
    room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
    store.delete(room.code);
    roomActivity(member.identity);
    var game = room.game;
    if (game != null && claimGameFinish(room, game, GameFinishReason.ABANDONED)) {
      // Como en finishDailyGame: un fallo síncrono del oyente se registra y no escapa de leave().
      CompletableFuture<Void> recorded;
      try {
        recorded = dailyRuns.abandoned(room.daily);
      } catch (RuntimeException error) {
        recorded = CompletableFuture.failedFuture(error);
      }
      pending.track(recorded.exceptionally(error -> logged("Failed to record abandoned daily run", error)));
    }
  }

  private void transferHost(LiveRoom room) {
    var next = Presence.oldestConnectedMember(room).orElse(null);
    if (next == null) return;
    for (var member : room.members.values()) if (member.roomRole == RoomRole.HOST) member.roomRole = RoomRole.MEMBER;
    next.roomRole = RoomRole.HOST;
    next.ready = false;
    room.hostId = next.identity.id();
    room.chat.setMuted(room.hostId, false); // el Host nunca está silenciado
  }

  // ---------------------------------------------------------------------------------------------- lobby

  public void selectGame(String playerId, @Nullable String gameId) {
    inRequiredRoom(playerId, current -> {
      assertNotDaily(current);
      var room = permissionRoom(playerId, RoomPermission.CHANGE_GAME);
      assertLobby(room);
      var module = registry.get(gameId).orElseThrow(() -> new RoomException("Unknown game"));
      room.selectedGameId = gameId;
      ensureGameConfig(room, module);
      // Elegir un juego suelto deja la sesión con solo ese juego (el modo de orden se conserva).
      room.gameSelectionMode = GameSelectionMode.withGameIds(room.gameSelectionMode, List.of(gameId));
      broadcast(room);
      return null;
    });
  }

  public void updateConfig(String playerId, @Nullable JsonNode config) {
    inRequiredRoom(playerId, room -> {
      assertNotDaily(room);
      updateGameConfig(playerId, room.selectedGameId, config);
      return null;
    });
  }

  public void updateGameConfig(String playerId, @Nullable String gameId, @Nullable JsonNode config) {
    inRequiredRoom(playerId, current -> {
      assertNotDaily(current);
      var room = permissionRoom(playerId, RoomPermission.EDIT_GAME_CONFIG);
      assertLobby(room);
      registry.get(gameId).orElseThrow(() -> new RoomException("Minijuego desconocido."));
      var engine = engine(gameId).orElseThrow();
      var parsed = toTree(engine.parseConfig(config));
      // Cambiar el modo de la configuración devuelve los modos marcados a su valor por defecto. El lobby ya no lo
      // cambia (marca los modos con room:update-allowed-modes); queda como defensa para otros clientes.
      if (!GameModes.configMode(gameId, room.gameConfigs.get(gameId)).equals(GameModes.configMode(gameId, parsed))) {
        room.allowedModes.remove(gameId);
      }
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
    inRequiredRoom(playerId, current -> {
      assertNotDaily(current);
      var room = permissionRoom(playerId, RoomPermission.EDIT_SESSION);
      assertLobby(room);
      room.sessionMode = RoomCommandParsers.sessionMode(mode);
      broadcast(room);
      return null;
    });
  }

  public void updateGameSelection(String playerId, @Nullable JsonNode mode) {
    inRequiredRoom(playerId, current -> {
      assertNotDaily(current);
      var room = permissionRoom(playerId, RoomPermission.EDIT_GAME_SELECTION);
      assertLobby(room);
      var parsed = RoomCommandParsers.gameSelectionMode(mode, room.selectedGameId);
      // Solo se comprueba que el juego exista: los jugadores conectados se miran al empezar, así el
      // host puede elegir juegos de 4 antes de que entren los demás.
      var manifests = new ArrayList<GameManifest>();
      for (var gameId : parsed.gameIds()) {
        var game = registry.get(gameId).orElseThrow(() -> new RoomException("Minijuego desconocido: " + gameId));
        manifests.add(game);
      }
      for (var game : manifests) ensureGameConfig(room, game);
      room.gameSelectionMode = parsed;
      // El primero de la lista es el minijuego elegido de la sala mientras está en el lobby; con la lista vacía se
      // conserva el último (selectedGameId nunca queda vacío).
      if (!parsed.gameIds().isEmpty()) room.selectedGameId = parsed.gameIds().getFirst();
      broadcast(room);
      return null;
    });
  }

  /**
   * {@code room:update-allowed-modes}: los modos de {@code gameId} que se juegan en la sesión (al menos uno, todos del
   * juego): al azar o por votación, cada uno es una opción; por orden, cada uno ocupa su turno en la cola. Se guardan
   * en el orden del catálogo.
   */
  public void updateAllowedModes(String playerId, @Nullable String gameId, @Nullable JsonNode modes) {
    inRequiredRoom(playerId, current -> {
      assertNotDaily(current);
      var room = permissionRoom(playerId, RoomPermission.EDIT_GAME_CONFIG);
      assertLobby(room);
      registry.get(gameId).orElseThrow(() -> new RoomException("Minijuego desconocido."));
      if (!GameModes.hasModes(gameId)) throw new RoomException("Este minijuego no tiene modos.");
      var requested = RoomCommandParsers.allowedModes(modes);
      var catalog = GameModes.of(gameId);
      for (var mode : requested) {
        if (!catalog.contains(mode)) throw new RoomException("Ese modo no existe en este minijuego.");
      }
      room.allowedModes.put(gameId, catalog.stream().filter(requested::contains).toList());
      broadcast(room);
      return null;
    });
  }

  public void setRoomRole(String actorId, @Nullable String playerId, @Nullable JsonNode requestedRole) {
    inRequiredRoom(actorId, current -> {
      assertNotDaily(current);
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
    inRequiredRoom(actorId, current -> {
      assertNotDaily(current);
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
      room.chat.setMuted(playerId, false); // el Host nunca está silenciado
      broadcast(room);
      return null;
    });
  }

  // ------------------------------------------------------------------------------------------------ chat

  /** {@code room:chat:send}; un {@code text} que no sea cadena cuenta como ausente. */
  public void sendChat(String playerId, @Nullable JsonNode text) {
    inRequiredRoom(playerId, room -> {
      assertNotDaily(room);
      chat.send(room, playerId, text);
      return null;
    });
  }

  /** {@code room:chat:delete}: Host y Co-host; un Co-host no borra mensajes del Host. */
  public void deleteChatMessage(String actorId, @Nullable JsonNode seq) {
    inRequiredRoom(actorId, current -> {
      assertNotDaily(current);
      var room = requiredRoom(actorId);
      RoomChatCommands.assertLobby(room);
      permissionRoom(actorId, RoomPermission.MODERATE_CHAT);
      chat.delete(room, actorId, seq);
      return null;
    });
  }

  /** {@code room:chat:mute}: el silencio dura la sala; solo el Host silencia a un Co-host y nadie al Host. */
  public void setChatMute(String actorId, @Nullable String playerId, @Nullable JsonNode muted) {
    inRequiredRoom(actorId, current -> {
      assertNotDaily(current);
      var room = requiredRoom(actorId);
      RoomChatCommands.assertLobby(room);
      permissionRoom(actorId, RoomPermission.MODERATE_CHAT);
      chat.setMute(room, actorId, playerId, muted);
      broadcast(room);
      return null;
    });
  }

  public void kick(String actorId, @Nullable String playerId) {
    inRequiredRoom(actorId, current -> {
      assertNotDaily(current);
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
      roomActivity(member.identity);
      broadcast(room);
      return null;
    });
  }

  /** {@code room:set-ready}; {@code requestedReady} crudo: solo un booleano es válido. */
  public void setReady(String playerId, @Nullable JsonNode requestedReady) {
    inRequiredRoom(playerId, room -> {
      assertNotDaily(room);
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

  // ---------------------------------------------------------------------------------------- rotación y arranque

  /** Con {@code playerCount = 0} se omiten los requisitos que dependen de los jugadores conectados. */
  private GameConfigReadiness.Context readinessContext(LiveRoom room, int playerCount) {
    return new GameConfigReadiness.Context(hostCustomCategories(room).size(), hostWouldYouRatherPrompts(room).size(),
        playerCount);
  }

  private void ensureGameConfig(LiveRoom room, GameManifest module) {
    if (!room.gameConfigs.containsKey(module.id())) {
      room.gameConfigs.put(module.id(), normalizedConfig(module, defaultConfigs.get(module.id())));
    }
  }

  public void startGame(String playerId) {
    inRequiredRoom(playerId, current -> {
      assertNotDaily(current);
      var room = permissionRoom(playerId, RoomPermission.START_GAME);
      assertLobby(room);
      // Sin minijuegos elegidos no hay nada que empezar (tiene prioridad sobre la confirmación de los invitados).
      if (room.gameSelectionMode.gameIds().isEmpty()) throw new RoomException("Choose at least one game");
      var pendingNames = room.members.values().stream()
          .filter(member -> member.presence == PresenceStatus.CONNECTED && !member.identity.id().equals(room.hostId)
              && !member.ready)
          .map(member -> member.identity.displayName()).toList();
      if (!pendingNames.isEmpty()) {
        throw new RoomException("Falta por confirmar: " + RoomTexts.formatPendingReadyNames(pendingNames) + ".");
      }
      rotation.assertRotationReady(room);
      var pick = rotation.firstPick(room);
      room.selectedGameId = pick.gameId();
      room.selectedMode = pick.mode();
      launchGame(room, null);
      return null;
    });
  }

  /**
   * Arranca {@code room.selectedGameId}. El modo sorteado o votado ({@code room.selectedMode}) se aplica solo a esta
   * partida y se consume: la configuración del lobby no cambia. Con {@code launch} (reto diario) la partida usa su
   * catálogo fijado y su azar, no se audita y no se exige el {@code minPlayers} del manifiesto (el motor comprueba el
   * suyo para la configuración del reto).
   */
  void launchGame(LiveRoom room, @Nullable DailyLaunch launch) {
    var pick = new GamePick(room.selectedGameId, room.selectedMode);
    room.selectedMode = null;
    var players = room.members.values().stream().filter(member -> member.presence == PresenceStatus.CONNECTED)
        .map(member -> new GamePlayer(member.identity.id(), member.identity.displayName(), true, true)).toList();
    var module = registry.get(room.selectedGameId).orElseThrow(() -> new RoomException("Unknown game"));
    var engine = engine(room.selectedGameId).orElseThrow();
    if (launch == null && players.size() < module.minPlayers()) {
      throw new RoomException("Se necesitan al menos " + module.minPlayers() + " jugadores.");
    }
    if (module.maxPlayers() != null && players.size() > module.maxPlayers()) {
      throw new RoomException("Este juego admite un máximo de " + module.maxPlayers() + " jugadores.");
    }
    var current = catalogSnapshot();
    var catalog = launch == null ? current
        : new GameCatalogSnapshot(random.uuid(), launch.pokemon(), current.visuals(), current.audio());
    var gameRandom = launch == null ? null : launch.random();
    var context = contextBuilder(catalog, gameRandom)
        .players(players)
        .now(clock.now())
        .roomCode(room.code)
        .hostId(room.hostId)
        .hostCustomCategories(hostCustomCategories(room))
        .hostWouldYouRatherPrompts(hostWouldYouRatherPrompts(room))
        .build();
    var config = engine.parseConfig(rotation.pickConfig(room, pick));
    var configTree = toTree(config);
    var configReason = GameConfigReadiness.validate(module.id(), configTree, new GameConfigReadiness.Context(
        context.hostCustomCategories().size(), context.hostWouldYouRatherPrompts().size(), players.size()));
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
    var auditReady = launch != null ? CompletableFuture.<Void>completedFuture(null)
        : track(audit.gameStarted(new GameStarted(resultId, room.historyId, room.code, module.id(),
            players.size(), configTree, context.now())), null);
    cancelPresenceGraces(room);
    room.game = new GameRuntime(catalog, resultId, module.id(), players.stream().map(GamePlayer::id).toList(), engine,
        config, configTree, state, context.now(), auditReady, gameRandom);
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
      assertNotDaily(room);
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
    if (room.daily != null || room.game != game || game.finishReason != null
        || !GameSkip.hasUnanimousSkip(room, eligibleIds)) {
      return false;
    }
    return skipGame(room, game);
  }

  private boolean claimGameFinish(LiveRoom room, GameRuntime game, GameFinishReason reason) {
    if (room.game != game || game.finishReason != null) return false;
    game.finishReason = reason;
    room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
    cancelPresenceGraces(room);
    return true;
  }

  /** La gracia de presencia pertenece a una partida: al terminar, ninguna llega a la siguiente. */
  private static void cancelPresenceGraces(LiveRoom room) {
    for (var member : room.members.values()) member.presenceGraceTimer = RoomTimer.cancel(member.presenceGraceTimer);
  }

  /** {@code presenceGraceMs} del manifiesto de la partida viva; {@code null} sin partida viva o sin gracia. */
  private @Nullable Integer livePresenceGraceMs(LiveRoom room) {
    var game = room.game;
    if (game == null || game.finishReason != null) return null;
    var graceMs = registry.get(game.gameId).map(GameManifest::presenceGraceMs).orElse(null);
    return graceMs != null && graceMs > 0 ? graceMs : null;
  }

  /**
   * El jugador se desconectó durante la partida viva y su gracia de presencia no ha vencido: el motor aún lo ve
   * conectado. Exige además su temporizador pendiente, así una desconexión anterior a la partida nunca da gracia.
   */
  boolean withinPresenceGrace(LiveRoom room, RoomMember member, long now) {
    return withinPresenceGrace(livePresenceGraceMs(room), member, now);
  }

  private static boolean withinPresenceGrace(@Nullable Integer graceMs, RoomMember member, long now) {
    return graceMs != null && member.presence == PresenceStatus.TEMPORARILY_DISCONNECTED
        && member.presenceGraceTimer != null && now < member.disconnectedAt + graceMs;
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
      advanceSessionAfterGame(room, new GamePick(game.gameId, previousMode(room)));
    } catch (RuntimeException error) {
      broadcast(room);
      LOG.error("Failed to continue after skipped game", error);
    }
    return true;
  }

  /** {@code optionId}: el id de la opción (el del juego si sale con un solo modo, {@code juego:MODO} si no). */
  public void voteNextGame(String playerId, @Nullable String optionId) {
    inRequiredRoom(playerId, room -> {
      assertNotDaily(room);
      voting.vote(room, playerId, optionId);
      return null;
    });
  }

  void tick(LiveRoom room) {
    if (room.phase == RoomPhase.NEXT_GAME_VOTE) {
      voting.resolve(room);
      broadcast(room);
      schedule(room);
      return;
    }
    if (room.phase == RoomPhase.NEXT_GAME_VOTE_RESULTS) {
      resetToLobby(room, false);
      try {
        launchGame(room, null);
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
        voting.resolveIfEveryoneVoted(room);
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

  /**
   * Solo memoria, con el lock tomado: el oyente apunta las rondas cerradas del estado público. Un fallo del oyente se
   * registra y no rompe la difusión ni la partida.
   */
  private void observeDaily(LiveRoom room, DailyRoom daily, GameRuntime game) {
    var publicState = game.engine.getPublicState(game.state, context(room));
    try {
      dailyRuns.observe(daily, publicState);
    } catch (RuntimeException error) {
      LOG.error("Failed to observe daily run", error);
    }
  }

  private void finishGame(LiveRoom room, GameRuntime game) {
    if (room.daily != null) {
      finishDailyGame(room, room.daily, game);
      return;
    }
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
      // Misma cuenta que RoomHistoryWriter: el nivel sube ya en GAME_RESULTS, sin esperar a la persistencia.
      if (member != null && member.xp != null) {
        member.xp = Experience.add(member.xp,
            Experience.xpForGame(standing.position(), gameResults.standings().size()));
      }
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
        winnerIds(gameResults),
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

  /**
   * Final de una partida del reto: sin puntos de sesión, XP, auditoría ni {@link GameResultsPersister}. Se observa el
   * estado final (la última ronda y el historial de Distance) antes de que el oyente fije {@code daily.outcome}, que la
   * difusión siguiente ya publica; la escritura del resultado va en segundo plano, fuera del lock.
   */
  private void finishDailyGame(LiveRoom room, DailyRoom daily, GameRuntime game) {
    if (!claimGameFinish(room, game, GameFinishReason.COMPLETED)) return;
    resetWhoIsWhoCursors(room);
    game.skipVoterIds.clear();
    game.resultsApplied = true;
    room.gamesPlayed += 1;
    room.phase = RoomPhase.GAME_RESULTS;
    observeDaily(room, daily, game);
    var gameResults = copyResults(game.engine.getResults(game.state));
    CompletableFuture<Void> recorded;
    try {
      recorded = dailyRuns.finished(daily, gameResults);
    } catch (RuntimeException error) {
      recorded = CompletableFuture.failedFuture(error);
    }
    pending.track(recorded.exceptionally(error -> logged("Failed to record daily run", error)));
  }

  /** Ganadores de la partida para el historial de la sesión; una partida sin clasificar (cooperativa) no tiene. */
  static List<String> winnerIds(GameResults results) {
    if (!results.isRanked()) return List.of();
    return results.standings().stream()
        .filter(standing -> standing.won() != null ? standing.won() : standing.position() == 1)
        .map(standing -> standing.playerId()).toList();
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
        roomActivity(member.identity);
        continue;
      }
      member.role = MemberRole.PLAYER;
      member.ready = false;
      if (resetSession) member.sessionPoints = 0;
    }
    if (resetSession) {
      // Sesión nueva: el minijuego elegido vuelve a ser el primero de la lista (con la lista vacía, se conserva).
      var gameIds = room.gameSelectionMode.gameIds();
      if (!gameIds.isEmpty()) room.selectedGameId = gameIds.getFirst();
      room.gamesPlayed = 0;
      room.sessionHistory = new ArrayList<>();
      var participants = new LinkedHashMap<String, SessionParticipant>();
      for (var member : room.members.values()) {
        participants.put(member.identity.id(), new SessionParticipant(member.identity, 0));
      }
      room.sessionParticipants = participants;
    }
    if (resetSession) room.selectedMode = null;
    cancelPresenceGraces(room);
    room.game = null;
    room.nextGameVote = null;
    room.phase = RoomPhase.LOBBY;
  }

  public void returnLobby(String playerId) {
    inRequiredRoom(playerId, current -> {
      assertNotDaily(current);
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
    inRequiredRoom(playerId, current -> {
      assertNotDaily(current);
      var room = permissionRoom(playerId, RoomPermission.START_GAME);
      if (room.phase != RoomPhase.GAME_RESULTS) throw new RoomException("La partida todavía no ha terminado.");
      try {
        advanceSessionAfterGame(room, null);
        return null;
      } catch (RuntimeException error) {
        broadcast(room);
        throw error;
      }
    });
  }

  /**
   * Tras una partida (o al saltarla, con {@code skippedPick}): la sesión termina si se cumplió su final; si no, sale
   * el siguiente par según el modo. Un par saltado nunca vuelve justo después, pero sí los otros modos de su juego: sin
   * otro par jugable, la sesión termina y se ve la clasificación final.
   */
  private void advanceSessionAfterGame(LiveRoom room, @Nullable GamePick skippedPick) {
    if (SessionMode.isComplete(room.sessionMode, room.gamesPlayed,
        room.sessionParticipants.values().stream().map(participant -> participant.sessionPoints).toList())) {
      showSessionResults(room);
      return;
    }
    var previous = new GamePick(room.selectedGameId, previousMode(room));
    // Saltar deja fuera solo el par juego+modo jugado: los otros modos del mismo juego siguen en la cola.
    var candidates = rotation.playablePicks(room, room.gameSelectionMode.gameIds()).stream()
        .filter(pick -> !pick.equals(skippedPick)).toList();
    if (candidates.isEmpty()) {
      if (skippedPick != null) {
        showSessionResults(room);
        return;
      }
      resetToLobby(room, false);
      throw new RoomException("Ningún minijuego elegido admite el número actual de jugadores.");
    }
    resetToLobby(room, false);
    if (voting.begin(room, candidates)) {
      broadcast(room);
      schedule(room);
      return;
    }
    launchFirstStartable(room, rotation.nextPicks(room, previous, candidates), skippedPick != null);
  }

  /** El modo con que se jugó la última partida, si su juego tiene modos (no repetir el par y seguir la cola). */
  private @Nullable String previousMode(LiveRoom room) {
    var game = room.game;
    if (game == null || !GameModes.hasModes(game.gameId)) return null;
    return GameModes.configMode(game.gameId, game.configTree);
  }

  /**
   * Arranca el primero de {@code picks} que pueda empezar. Si ninguno puede: tras un salto se pasa a la
   * clasificación final (la sala no vuelve al lobby); si no, se propaga el último error.
   */
  private void launchFirstStartable(LiveRoom room, List<GamePick> picks, boolean afterSkip) {
    RuntimeException last = null;
    for (var pick : picks) {
      room.selectedGameId = pick.gameId();
      room.selectedMode = pick.mode();
      try {
        launchGame(room, null);
        return;
      } catch (RuntimeException error) {
        LOG.warn("Game {} could not start; trying the next one", pick.gameId(), error);
        last = error;
      }
    }
    if (afterSkip) {
      showSessionResults(room);
      return;
    }
    if (last != null) throw last;
  }

  private void showSessionResults(LiveRoom room) {
    room.transitionTimer = RoomTimer.cancel(room.transitionTimer);
    cancelPresenceGraces(room);
    room.game = null;
    room.nextGameVote = null;
    room.phase = RoomPhase.SESSION_RESULTS;
    broadcast(room);
  }

  public void endSession(String playerId) {
    inRequiredRoom(playerId, current -> {
      assertNotDaily(current);
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

  /** Con partida, su azar propio si lo tiene (el reto diario): cada contexto consume la misma fuente. */
  private GameContext context(LiveRoom room, GameCatalogSnapshot catalog) {
    long now = clock.now();
    var graceMs = livePresenceGraceMs(room);
    var players = room.members.values().stream().map(member -> new GamePlayer(member.identity.id(),
        member.identity.displayName(),
        member.presence == PresenceStatus.CONNECTED || withinPresenceGrace(graceMs, member, now),
        member.role == MemberRole.PLAYER && member.presence != PresenceStatus.LEFT)).toList();
    return contextBuilder(catalog, room.game != null ? room.game.random : null)
        .players(players)
        .now(now)
        .roomCode(room.code)
        .hostId(room.hostId)
        .hostCustomCategories(hostCustomCategories(room))
        .hostWouldYouRatherPrompts(hostWouldYouRatherPrompts(room))
        .build();
  }

  /** Catálogos fijados y precargas: la imagen original ({@code preloadGameImage} de Node) y la transformada. */
  private GameContext.Builder contextBuilder(GameCatalogSnapshot catalog, @Nullable DoubleSupplier gameRandom) {
    return GameContext.builder(catalog.pokemon(), gameRandom != null ? gameRandom : random::next)
        .pokemonVisuals(catalog.visuals())
        .pokemonAudio(catalog.audio())
        .tcgCards(tcgCards)
        // preloadImage es el gancho heredado de los demás motores; Shiny Quiz usa preloadAsset.
        .preloadImage(assets::preload)
        .preloadAsset(assets::preload);
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
    // Reto: cada difusión de la partida viva se observa (Learnset solo publica la última ronda en ROUND_RESULTS); el
    // estado final lo observa finishDailyGame antes de fijar el resultado.
    var game = room.game;
    if (room.daily != null && game != null && game.finishReason == null) observeDaily(room, room.daily, game);
    room.revision += 1;
    room.updatedAt = clock.now();
    views.broadcast(room, context(room), hostCustomCategories(room).size(), hostWouldYouRatherPrompts(room).size());
    roomActivity(room);
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

  /** Guarda única de los comandos de lobby y de sesión: en la sala del reto no existen. */
  private static void assertNotDaily(LiveRoom room) {
    if (room.daily != null) throw new RoomException(DAILY_UNAVAILABLE);
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
        new LinkedHashMap<String, Number>(standing.stats()))).toList(), source.ranked());
  }

  private Optional<ErasedEngine> engine(@Nullable String gameId) {
    return gameId == null ? Optional.empty() : Optional.ofNullable(engines.get(gameId));
  }

  private static boolean isInteger(double value) {
    return Double.isFinite(value) && value == Math.rint(value);
  }

  /** {@code configSchema.parse(raw)}; sin motor (solo en los registros parciales de los tests) se guarda tal cual. */
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

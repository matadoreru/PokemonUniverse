package es.pokemonuniverse.application.rooms;

import es.pokemonuniverse.adapters.out.resources.ClasspathGameRegistryLoader;
import es.pokemonuniverse.application.assets.GameAssetService;
import es.pokemonuniverse.application.assets.LoadedAsset;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.GameEngine;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.room.LiveRoom;
import es.pokemonuniverse.domain.room.PresenceStatus;
import es.pokemonuniverse.golden.GoldenCatalogs;
import io.micronaut.core.type.Argument;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Montaje de {@code manager.test.ts}: coordinador real con los motores portados, catálogo dorado gen1-2, reloj y
 * temporizadores manuales y azar {@code mulberry32}. {@code fakeGames} registra {@link FakeEngine} bajo manifiestos
 * reales de juegos aún sin motor, para las rotaciones de tres juegos.
 */
final class RoomTestKit {

  static final ObjectMapper MAPPER = ObjectMapper.getDefault();
  static final GameRegistry REAL_REGISTRY = ClasspathGameRegistryLoader.loadFromClasspath(MAPPER);
  static final InMemoryPokemonCatalog CATALOG = GoldenCatalogs.load("gen1-2");
  static final String HIGHER_LOWER_1_ROUND = """
      {"generations":[1],"categories":["ATTACK"],"showPreviousValue":true,"answerVisibility":"LIVE",
       "difficulty":"NORMAL","roundSeconds":10,"rounds":1}""";

  final ManualTime time;
  final SeededRandom random;
  final RecordingEvents events = new RecordingEvents();
  final RecordingAudit audit = new RecordingAudit();
  final RecordingPersister persister = new RecordingPersister();
  final GameRegistry registry;
  final RoomCoordinator manager;
  /** Origen sin red: cualquier precarga de imagen recibe un recurso vacío. */
  static final GameAssetService ASSETS = new GameAssetService(source -> new LoadedAsset(new byte[0], "image/png"),
      GameAssetService.defaultCache());

  RoomTestKit(String... fakeGames) {
    this(50_000, UserGameConfigPreferences.NO_OP, fakeGames);
  }

  RoomTestKit(long start, UserGameConfigPreferences preferences, String... fakeGames) {
    this(start, preferences, HostContentProvider.EMPTY, registry(fakeGames));
  }

  RoomTestKit(long start, UserGameConfigPreferences preferences, HostContentProvider host, GameRegistry registry) {
    this.time = new ManualTime(start);
    this.random = new SeededRandom(42);
    this.registry = registry;
    this.manager = new RoomCoordinator(registry, MAPPER, events, audit, persister, preferences, host, time, random,
        time, RoomSettings.DEFAULTS, () -> GameCatalogs.of(CATALOG), ASSETS);
  }

  static GameRegistry registry(String... fakeGames) {
    var engines = new LinkedHashMap<String, GameEngine<?, ?, ?, ?>>();
    for (var id : List.of("higher-lower", "pokedex-distance")) engines.put(id, REAL_REGISTRY.engine(id).orElseThrow());
    for (var id : fakeGames) engines.put(id, new FakeEngine(REAL_REGISTRY.get(id).orElseThrow()));
    return REAL_REGISTRY.withEngines(engines);
  }

  static AuthUser guest(String id, String displayName) {
    return new AuthUser(id, displayName, AuthUser.Kind.GUEST, null, null, new AvatarRef.Default());
  }

  static AuthUser user(String id, String displayName, String email) {
    return new AuthUser(id, displayName, AuthUser.Kind.USER, email, null, new AvatarRef.Default());
  }

  static JsonNode json(String text) {
    try {
      return MAPPER.readValue(text, JsonNode.class);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  static JsonNode tree(Object value) {
    try {
      return MAPPER.writeValueToTree(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  static String serialize(Object value) {
    try {
      return MAPPER.writeValueAsString(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @SuppressWarnings("unchecked")
  static Map<String, Object> asMap(Object value) {
    try {
      return MAPPER.readValue(serialize(value), Argument.mapOf(String.class, Object.class));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Crea la sala con {@code people[0]} como host y une al resto; conexión {@code socket-<id>}. */
  LiveRoom room(int maxPlayers, AuthUser... people) {
    var created = manager.create(people[0], "socket-" + people[0].id(), JsonNode.createNumberNode(maxPlayers));
    var room = manager.store.get(created.code());
    for (int index = 1; index < people.length; index++) {
      manager.join(people[index], "socket-" + people[index].id(), room.code);
    }
    return room;
  }

  /** {@code startReady}: marca listos a los conectados que no son host y arranca. */
  void startReady(LiveRoom room, String playerId) {
    for (var member : List.copyOf(room.members.values())) {
      if (member.presence == PresenceStatus.CONNECTED && !member.identity.id().equals(room.hostId)) {
        manager.setReady(member.identity.id(), true);
      }
    }
    manager.startGame(playerId);
  }

  /** Selecciona higher-lower con una ronda de 10 s sobre la generación 1 (configuración de los tests TS). */
  void selectHigherLower(String hostId) {
    manager.selectGame(hostId, "higher-lower");
    manager.updateConfig(hostId, json(HIGHER_LOWER_1_ROUND));
  }

  /** Avanza el reloj hasta pasado el siguiente plazo del juego y dispara los temporizadores vencidos. */
  void passDeadline(LiveRoom room) {
    var deadline = room.game.engine.getLifecycle(room.game.state).nextDeadline();
    time.advance(Math.max(0, deadline - time.now()) + RoomCoordinator.DEADLINE_TOLERANCE_MS);
  }

  JsonNode publicGame(LiveRoom room, String playerId) {
    return manager.view(room, playerId).game();
  }

  static JsonNode answer(String choice) {
    return json("{\"type\":\"ANSWER\",\"choice\":\"" + choice + "\"}");
  }

  /** {@code activeSkipFixture(playerCount, rounds)}: higher-lower en marcha con {@code skip-pN}. */
  record SkipFixture(RoomTestKit kit, LiveRoom room, List<AuthUser> people, String instanceId) {

    void setVote(String playerId, boolean wantsToSkip) {
      setVote(playerId, wantsToSkip, instanceId);
    }

    void setVote(String playerId, boolean wantsToSkip, String targetInstanceId) {
      kit.manager.setGameSkipVote(playerId, json("{\"gameInstanceId\":\"" + targetInstanceId + "\",\"wantsToSkip\":"
          + wantsToSkip + "}"));
    }
  }

  static SkipFixture activeSkipFixture(int playerCount, int rounds, String... fakeGames) {
    var kit = new RoomTestKit(fakeGames);
    var people = new java.util.ArrayList<AuthUser>();
    for (int index = 0; index < playerCount; index++) {
      people.add(guest("skip-p" + (index + 1), index == 0 ? "Host" : "Player " + (index + 1)));
    }
    var created = kit.manager.create(people.get(0), "skip-socket-1",
        JsonNode.createNumberNode(Math.max(8, playerCount)));
    var room = kit.manager.store.get(created.code());
    for (int index = 1; index < people.size(); index++) {
      kit.manager.join(people.get(index), "skip-socket-" + (index + 1), room.code);
    }
    kit.manager.selectGame(people.get(0).id(), "higher-lower");
    var config = new LinkedHashMap<String, Object>(asMap(room.gameConfigs.get("higher-lower")));
    config.put("rounds", rounds);
    kit.manager.updateConfig(people.get(0).id(), tree(config));
    kit.startReady(room, people.get(0).id());
    return new SkipFixture(kit, room, List.copyOf(people), room.game.resultId);
  }
}

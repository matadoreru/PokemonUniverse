package es.pokemonuniverse.application.daily;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import es.pokemonuniverse.adapters.out.persistence.DailyChallengeRepository;
import es.pokemonuniverse.adapters.out.persistence.DailyResultEntity;
import es.pokemonuniverse.adapters.out.persistence.DailyResultRepository;
import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.application.errors.UnauthorizedException;
import es.pokemonuniverse.application.friends.UserConnections;
import es.pokemonuniverse.application.rooms.DailyRunListener;
import es.pokemonuniverse.application.rooms.DailyTestRooms;
import es.pokemonuniverse.application.rooms.RoomException;
import es.pokemonuniverse.application.rooms.RoomView;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.daily.CatalogFingerprint;
import es.pokemonuniverse.domain.daily.DailyCalendar;
import es.pokemonuniverse.domain.daily.DailySeed;
import es.pokemonuniverse.domain.game.engine.GamePhase;
import es.pokemonuniverse.domain.game.engines.pokedexdistance.PokedexDistanceTypes.PokedexDistanceState;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.pokemon.InMemoryPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.pokemon.PokemonCatalog;
import io.micronaut.context.BeanContext;
import io.micronaut.core.type.Argument;
import io.micronaut.jdbc.DataSourceResolver;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.slf4j.LoggerFactory;

/** Servicio del reto diario contra Postgres real, con el coordinador de prueba y su reloj manual. */
@MicronautTest(transactional = false)
class DailyChallengeServiceTest {

  private static final DailyKey KEY = new DailyKey("daily-test-key-daily-test-key-0000".getBytes());
  private static final String ALREADY_PLAYED = "Daily challenge already played";

  /** Conexiones falsas: guarda cada envío. */
  static final class RecordingConnections implements UserConnections {
    record Sent(String userId, String event, Object payload) {}

    final List<Sent> sent = new CopyOnWriteArrayList<>();

    @Override
    public boolean isOnline(String userId) {
      return true;
    }

    @Override
    public void send(String userId, String event, Object payload) {
      sent.add(new Sent(userId, event, payload));
    }
  }

  record Finished(String userId, DailyResultView result) {}

  @Inject DailyChallengeRepository challenges;
  @Inject DailyResultRepository results;
  @Inject UserRepository users;
  @Inject DataSource dataSource;
  @Inject DataSourceResolver resolver;
  @Inject JsonMapper json;
  @Inject BeanContext beans;

  private final List<String> createdUsers = new ArrayList<>();
  private final List<LocalDate> createdDates = new ArrayList<>();
  private final RecordingConnections connections = new RecordingConnections();
  private final List<Finished> finished = new CopyOnWriteArrayList<>();
  private final ExecutorService executor = Executors.newFixedThreadPool(2);
  private LocalDate date;
  private DailyTestRooms rooms;
  private DailyRunRecorder recorder;
  private DailyChallengeService service;

  @BeforeEach
  void setUp() {
    // Una fecha lejana y distinta por test, para no chocar con otros tests ni con datos reales.
    date = LocalDate.of(2400, 1, 1).plusDays(Math.floorMod(UUID.randomUUID().getMostSignificantBits(), 200_000));
    // La fixture gen1-2 solo trae learnsets de referencia 1 y 2, y el reto de Learnset Guess usa todas las
    // generaciones: los tests que juegan el juego del sorteo usan un día en el que no sale.
    while (drawnGame(date).equals("learnset-guess")) date = date.plusDays(1);
    track(date);
    rooms = new DailyTestRooms(at(date, LocalTime.NOON), this::recorderFor);
    wire(rooms);
  }

  /** El recorder de cada coordinador de prueba, con el reloj de su sala. */
  private DailyRunListener recorderFor(Clock clock) {
    recorder = new DailyRunRecorder(results, connections, (userId, result) -> finished.add(new Finished(userId,
        result)), clock, json, executor);
    return recorder;
  }

  private void wire(DailyTestRooms target) {
    service = new DailyChallengeService(target.manager(), challenges, results, users, DailyTestRooms.registry(),
        target.clock(), KEY, json);
  }

  @AfterEach
  void cleanUp() throws SQLException {
    executor.shutdown();
    createdUsers.forEach(id -> users.deleteById(id));
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement("DELETE FROM \"DailyChallenge\" WHERE \"date\" = ?")) {
      for (var day : createdDates) {
        statement.setObject(1, day);
        statement.executeUpdate();
      }
    }
  }

  private void track(LocalDate day) {
    if (!createdDates.contains(day)) createdDates.add(day);
  }

  private static long at(LocalDate day, LocalTime time) {
    return day.atTime(time).atZone(DailyCalendar.ZONE).toInstant().toEpochMilli();
  }

  private AuthUser user() {
    var tag = UUID.randomUUID().toString().substring(0, 8);
    var id = users.save(UserEntity.create(UUID.randomUUID().toString(), "d_" + tag, tag + "@mail.com", "h",
        Instant.now())).getId();
    createdUsers.add(id);
    return new AuthUser(id, "d_" + tag, AuthUser.Kind.USER, tag + "@mail.com", null, new AvatarRef.Default());
  }

  private static List<String> sortedIds(PokemonCatalog catalog) {
    return catalog.all().stream()
        .sorted(Comparator.comparingInt(Pokemon::nationalDexNumber).thenComparing(Pokemon::id))
        .map(Pokemon::id)
        .toList();
  }

  private String toJson(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private <T> List<T> listOf(String text, Class<T> type) {
    try {
      return json.readValue(text, Argument.listOf(type));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** Fija el reto de {@code day} como lo haría el servidor, con el catálogo dorado. */
  private void pin(LocalDate day, String gameId, List<String> ids) {
    track(day);
    challenges.insertIfAbsent(day, gameId, toJson(ids), CatalogFingerprint.of(ids));
  }

  private void pin(String gameId) {
    pin(date, gameId, sortedIds(DailyTestRooms.goldenCatalog()));
  }

  private String drawnGame(LocalDate day) {
    return DailyGames.ofTheDay(DailySeed.seed(KEY.bytes(), day)).gameId();
  }

  private RoomView start(AuthUser user) {
    return service.start(user, "socket-" + user.id());
  }

  private DailyResultEntity row(AuthUser user, LocalDate day) {
    return results.findByUserIdAndDate(user.id(), day).orElseThrow();
  }

  private void playToResults(AuthUser user) {
    rooms.playByTimeouts(user.id(), state -> {});
    rooms.manager().flush();
  }

  /** Objetivos de Distance por ronda (sin desempates), jugando por tiempo vencido. */
  private Map<Integer, Integer> distanceTargets(DailyTestRooms target, AuthUser user) {
    var targets = new TreeMap<Integer, Integer>();
    target.playByTimeouts(user.id(), state -> {
      var distance = (PokedexDistanceState) state;
      if (distance.phase() == GamePhase.ROUND_ACTIVE && distance.tiebreakDepth() == 0) {
        targets.put(distance.roundNumber(), distance.targetDexNumber());
      }
    });
    return targets;
  }

  /** El catálogo dorado con un Pokémon nuevo al principio, como si llegara con la sincronización del día. */
  private static InMemoryPokemonCatalog catalogWithNewcomer() {
    var golden = DailyTestRooms.goldenCatalog();
    var base = golden.byId("pikachu").orElseThrow();
    var rows = new ArrayList<Pokemon>();
    rows.add(new Pokemon("aaa-newcomer", 0, base.name(), 1, true, base.sprite(), base.shinySprite(),
        base.palette(), base.paletteWeights(), base.hp(), base.attack(), base.defense(), base.specialAttack(),
        base.specialDefense(), base.speed(), base.baseStatTotal(), base.heightDecimeters(), base.weightHectograms(),
        base.evolutionStage(), base.evolutionStageCount(), base.legendaryStatus(), base.color(), base.abilities(),
        base.names(), base.types()));
    rows.addAll(golden.all());
    return new InMemoryPokemonCatalog(rows);
  }

  private static void assertRejects(String message, Executable operation) {
    assertEquals(message, assertThrows(RoomException.class, operation).getMessage());
  }

  @Test
  void productionBeansWireWithoutCycle() {
    // El recorder no depende del coordinador, así que el coordinador lo recibe en su constructor sin ciclo.
    assertNotNull(beans.getBean(DailyChallengeService.class));
    assertTrue(beans.getBean(DailyRunListener.class)
        instanceof DailyRunRecorder);
  }

  // ------------------------------------------------------------------------------------------------ start

  @Test
  void guestIsRejected() {
    var guest = new AuthUser("guest-" + UUID.randomUUID(), "Invitado", AuthUser.Kind.GUEST, null, null,
        new AvatarRef.Default());
    assertRejects("Registered account required", () -> start(guest));
    assertEquals("Registered account required",
        assertThrows(UnauthorizedException.class, () -> service.overview(guest)).getMessage());
    assertEquals("Registered account required",
        assertThrows(UnauthorizedException.class, () -> service.leaderboard(guest)).getMessage());
    assertTrue(challenges.findById(date).isEmpty());
  }

  @Test
  void inRoomIsRejected() {
    var ash = user();
    rooms.manager().create(ash, "socket-ash", JsonNode.createNumberNode(4));
    assertRejects("Leave your current room first", () -> start(ash));
    assertTrue(challenges.findById(date).isEmpty(), "no fija el día para quien está en otra sala");
    assertTrue(results.findByUserIdAndDate(ash.id(), date).isEmpty());
  }

  @Test
  void startPinsCatalogAndInsertsStarted() {
    var ash = user();
    var view = start(ash);
    var gameId = drawnGame(date);
    var row = challenges.findById(date).orElseThrow();
    var ids = sortedIds(DailyTestRooms.goldenCatalog());
    assertEquals(gameId, row.getGameId());
    assertEquals(ids, listOf(row.getPokemonIds(), String.class));
    assertEquals(CatalogFingerprint.of(ids), row.getCatalogFingerprint());

    var result = row(ash, date);
    assertEquals("STARTED", result.getStatus());
    assertEquals(gameId, result.getGameId());
    var game = DailyGames.byId(gameId).orElseThrow();
    assertEquals(new RoomView.DailyView(gameId, date.toString(), game.roundCount(), null), view.daily());
    assertEquals(gameId, view.selectedGameId());
    JsonNode expected;
    try {
      expected = game.config(json.writeValueToTree(DailyTestRooms.registry().get(gameId).orElseThrow()
          .defaultConfig()));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    var actual = view.gameConfigs().get(gameId);
    for (var entry : expected.entries()) {
      assertEquals(entry.getValue(), actual.get(entry.getKey()), entry.getKey());
    }
    assertEquals(result.getId(), rooms.daily(ash.id()).resultRowId);
  }

  @Test
  void pinnedGameWinsOverDraw() {
    var drawn = drawnGame(date);
    var other = DailyGames.all().stream().map(DailyGame::gameId).filter(id -> !id.equals(drawn)).findFirst()
        .orElseThrow();
    pin(other);
    var ash = user();
    assertEquals(other, service.overview(ash).gameId());
    var view = start(ash);
    assertEquals(other, view.daily().gameId());
    assertEquals(other, row(ash, date).getGameId());
  }

  @Test
  void overviewWithoutRowShowsTheDrawAndWritesNothing() {
    var ash = user();
    var overview = service.overview(ash);
    var drawn = drawnGame(date);
    var manifest = DailyTestRooms.registry().get(drawn).orElseThrow();
    assertEquals(drawn, overview.gameId());
    assertEquals(manifest.name(), overview.name());
    assertEquals(manifest.icon(), overview.icon());
    assertEquals(date.toString(), overview.date());
    assertEquals(Instant.ofEpochMilli(at(date.plusDays(1), LocalTime.MIDNIGHT)).toString(), overview.resetsAt());
    assertEquals(DailyGames.byId(drawn).orElseThrow().roundCount(), overview.roundCount());
    assertTrue(challenges.findById(date).isEmpty());
  }

  @Test
  void onlyOneAttemptPerDay() {
    var ash = user();
    start(ash);
    playToResults(ash);
    rooms.manager().leave(ash.id());
    rooms.manager().flush();
    assertRejects(ALREADY_PLAYED, () -> start(ash));
    assertEquals("FINISHED", row(ash, date).getStatus());

    var tomorrow = date.plusDays(1);
    pin(tomorrow, "higher-lower", sortedIds(DailyTestRooms.goldenCatalog()));
    rooms.setTime(at(tomorrow, LocalTime.NOON));
    var view = start(ash);
    assertEquals(tomorrow.toString(), view.daily().date());
    assertEquals("STARTED", row(ash, tomorrow).getStatus());
  }

  @Test
  void concurrentStartsLeaveOneRow() throws Exception {
    var ash = user();
    // El ganador espera a que el perdedor choque con el índice único: así ninguno ve aún la sala del otro.
    var loserDone = new CountDownLatch(1);
    rooms.holdDailyStartsUntil(loserDone);
    var barrier = new CyclicBarrier(2);
    var views = new CopyOnWriteArrayList<RoomView>();
    var errors = new CopyOnWriteArrayList<String>();
    var threads = new ArrayList<Thread>();
    for (int index = 0; index < 2; index++) {
      var thread = new Thread(() -> {
        try {
          barrier.await(10, TimeUnit.SECONDS);
          views.add(start(ash));
        } catch (RoomException error) {
          errors.add(error.getMessage());
          loserDone.countDown();
        } catch (Exception error) {
          errors.add(error.toString());
          loserDone.countDown();
        }
      });
      threads.add(thread);
      thread.start();
    }
    for (var thread : threads) thread.join(20_000);
    assertEquals(1, views.size(), "salas: " + views + ", errores: " + errors);
    assertEquals(List.of(ALREADY_PLAYED), errors);
    try (var connection = resolver.resolve(dataSource).getConnection();
        var statement = connection.prepareStatement("SELECT COUNT(*) FROM \"DailyResult\" WHERE \"userId\" = ?")) {
      statement.setString(1, ash.id());
      try (var rs = statement.executeQuery()) {
        rs.next();
        assertEquals(1, rs.getInt(1));
      }
    }
  }

  @Test
  void failedLaunchCompensates() {
    var ash = user();
    rooms.failNextDailyStarts(1);
    assertRejects("Fallo de arranque de prueba", () -> start(ash));
    assertTrue(results.findByUserIdAndDate(ash.id(), date).isEmpty(), "la fila STARTED se borra");
    assertEquals("AVAILABLE", service.overview(ash).status());

    var view = start(ash);
    assertNotNull(view.daily());
    assertEquals("STARTED", row(ash, date).getStatus());
  }

  @Test
  void lateFailureAfterLaunchKeepsTheRow() {
    var ash = user();
    rooms.failNextDailyStartsAfterLaunch(1);
    assertRejects("Fallo tardío de prueba", () -> start(ash));
    // La sala ya arrancó: la fila STARTED es la de esa partida y no se borra.
    assertEquals("STARTED", row(ash, date).getStatus());
    assertEquals("IN_PROGRESS", service.overview(ash).status());
    rooms.manager().leave(ash.id());
    rooms.manager().flush();
    assertEquals("ABANDONED", row(ash, date).getStatus());
    assertRejects(ALREADY_PLAYED, () -> start(ash));
  }

  @Test
  void emptyCatalogIsNotPinned() {
    var ash = user();
    rooms.replaceCatalog(new InMemoryPokemonCatalog(List.of()));
    assertRejects(DailyChallengeService.CATALOG_UNAVAILABLE, () -> start(ash));
    assertTrue(challenges.findById(date).isEmpty(), "no fija una lista vacía para todo el día");
    assertTrue(results.findByUserIdAndDate(ash.id(), date).isEmpty());

    rooms.replaceCatalog(DailyTestRooms.goldenCatalog());
    assertNotNull(start(ash).daily());
    assertEquals(sortedIds(DailyTestRooms.goldenCatalog()),
        listOf(challenges.findById(date).orElseThrow().getPokemonIds(), String.class));
  }

  @Test
  void leavingMidRunIsAbandonedAndFinal() {
    var ash = user();
    start(ash);
    rooms.manager().leave(ash.id());
    rooms.manager().flush();
    var row = row(ash, date);
    assertEquals("ABANDONED", row.getStatus());
    assertNotNull(row.getFinishedAt());
    assertNull(row.getScore());
    assertRejects(ALREADY_PLAYED, () -> start(ash));
    assertEquals("ABANDONED", service.overview(ash).status());
    assertTrue(connections.sent.isEmpty());
    assertTrue(finished.isEmpty());
  }

  @Test
  void finishWritesResultAndNotifies() {
    pin("pokedex-distance");
    var ash = user();
    start(ash);
    // Acierta el primer objetivo y deja vencer el resto.
    var state = (PokedexDistanceState) rooms.gameState(ash.id());
    var target = DailyTestRooms.goldenCatalog().byDexNumber(state.targetDexNumber()).orElseThrow().id();
    rooms.advance(1_000);
    rooms.action(ash.id(), JsonNode.createObjectNode(Map.of("type",
        JsonNode.createStringNode("SELECT_POKEMON"), "pokemonId", JsonNode.createStringNode(target))));
    playToResults(ash);

    var outcome = rooms.daily(ash.id()).outcome;
    assertNotNull(outcome);
    assertEquals(0, outcome.rounds().getFirst());
    assertTrue(outcome.score() > 0);
    var row = row(ash, date);
    assertEquals("FINISHED", row.getStatus());
    assertEquals(outcome.score(), row.getScore());
    assertEquals(outcome.correct(), row.getCorrect());
    assertEquals(outcome.rounds(), listOf(row.getRounds(), Integer.class));
    assertNotNull(row.getFinishedAt());

    assertEquals(1, connections.sent.size());
    var sent = connections.sent.getFirst();
    assertEquals(ash.id(), sent.userId());
    assertEquals("daily:recorded", sent.event());
    assertEquals(new DailyRunRecorder.RecordedPayload(date.toString(), "pokedex-distance"), sent.payload());
    assertEquals(1, finished.size());
    var view = finished.getFirst().result();
    assertEquals(ash.id(), finished.getFirst().userId());
    assertEquals(new DailyResultView(date.toString(), "pokedex-distance", outcome.score(), outcome.correct(),
        outcome.rounds(), row.getFinishedAt().toString()), view);
  }

  @Test
  void finishedNeverBecomesAbandoned() {
    var ash = user();
    start(ash);
    var daily = rooms.daily(ash.id());
    playToResults(ash);
    recorder.abandoned(daily).join();
    rooms.manager().leave(ash.id());
    rooms.manager().flush();
    var row = row(ash, date);
    assertEquals("FINISHED", row.getStatus());
    assertNotNull(row.getScore());
    assertEquals("FINISHED", service.overview(ash).status());
  }

  // ------------------------------------------------------------------------------------- catálogo fijado

  @Test
  void catalogReloadBetweenRunsKeepsContent() {
    pin("pokedex-distance");
    var ash = user();
    var misty = user();
    start(ash);
    var first = distanceTargets(rooms, ash);
    rooms.replaceCatalog(catalogWithNewcomer());
    start(misty);
    var second = distanceTargets(rooms, misty);
    assertEquals(5, first.size());
    assertEquals(first, second);
  }

  @Test
  void restartReusesPinnedIds() {
    pin("pokedex-distance");
    var ash = user();
    start(ash);
    var first = distanceTargets(rooms, ash);
    rooms.manager().flush();

    // Reinicio: coordinador y servicio nuevos sobre la misma BD, con otro catálogo vigente.
    var restarted = new DailyTestRooms(rooms.clock().now(), this::recorderFor);
    restarted.replaceCatalog(catalogWithNewcomer());
    wire(restarted);
    var misty = user();
    service.start(misty, "socket-misty");
    assertEquals(first, distanceTargets(restarted, misty));
    var row = challenges.findById(date).orElseThrow();
    assertFalse(listOf(row.getPokemonIds(), String.class).contains("aaa-newcomer"));
  }

  @Test
  void missingPinnedIdLogsWarningAndStillStarts() {
    var ids = new ArrayList<>(sortedIds(DailyTestRooms.goldenCatalog()));
    ids.add("missingno");
    pin(date, "pokedex-distance", ids);
    var logger = (Logger) LoggerFactory.getLogger(DailyChallengeService.class);
    var appender = new ListAppender<ILoggingEvent>();
    appender.start();
    logger.addAppender(appender);
    try {
      var view = start(user());
      assertEquals("pokedex-distance", view.daily().gameId());
    } finally {
      logger.detachAppender(appender);
    }
    var warnings = appender.list.stream().filter(event -> event.getLevel() == Level.WARN).toList();
    assertEquals(1, warnings.size());
    assertTrue(warnings.getFirst().getFormattedMessage().contains("missingno"),
        warnings.getFirst().getFormattedMessage());
  }

  // ------------------------------------------------------------------------------------------- lecturas

  @Test
  void overviewStatuses() {
    var ash = user();
    var available = service.overview(ash);
    assertEquals("AVAILABLE", available.status());
    assertNull(available.result());
    assertEquals(0, available.players());

    start(ash);
    assertEquals("IN_PROGRESS", service.overview(ash).status());
    playToResults(ash);
    var done = service.overview(ash);
    assertEquals("FINISHED", done.status());
    var mine = row(ash, date);
    assertEquals(new DailyOverview.MyResult(mine.getScore(), mine.getCorrect(), done.roundCount(),
        listOf(mine.getRounds(), Integer.class), 1, 1), done.result());
    assertEquals(1, done.players());

    var misty = user();
    start(misty);
    rooms.manager().leave(misty.id());
    rooms.manager().flush();
    assertEquals("ABANDONED", service.overview(misty).status());
    assertNull(service.overview(misty).result());

    // STARTED sin partida viva (p. ej. tras un reinicio) se lee como abandonado.
    var brock = user();
    results.save(DailyResultEntity.started(UUID.randomUUID().toString(), brock.id(), date, mine.getGameId(),
        Instant.now()));
    assertEquals("ABANDONED", service.overview(brock).status());
    assertEquals(1, service.overview(brock).players());
  }

  @Test
  void leaderboardTiesAndMe() {
    pin("higher-lower");
    var base = Instant.parse("2400-01-01T00:00:00Z");
    var people = new ArrayList<AuthUser>();
    var scores = new ArrayList<Integer>();
    scores.add(900);
    scores.add(900);
    scores.add(800);
    for (int index = 0; index < 49; index++) scores.add(700);
    scores.add(100); // la propia cuenta, fuera de las 50
    for (int index = 0; index < scores.size(); index++) {
      var person = user();
      people.add(person);
      var started = results.save(DailyResultEntity.started(UUID.randomUUID().toString(), person.id(), date,
          "higher-lower", base));
      results.finish(started.getId(), scores.get(index), index % 10, "[1,0,1]", base.plusSeconds(index));
    }
    var me = people.getLast();

    var board = service.leaderboard(me);
    assertEquals(date.toString(), board.date());
    assertEquals("higher-lower", board.gameId());
    assertEquals(53, board.total());
    assertEquals(50, board.entries().size());
    assertEquals(List.of(1, 1, 3, 4, 4), board.entries().subList(0, 5).stream()
        .map(DailyLeaderboard.Entry::position).toList());
    var top = board.entries().getFirst();
    assertEquals(people.getFirst().id(), top.userId());
    assertEquals(people.getFirst().displayName(), top.username());
    assertEquals(new AvatarRef.Default(), top.avatar());
    assertEquals(900, top.score());
    assertEquals(base.toString(), top.finishedAt());
    assertEquals(people.get(1).id(), board.entries().get(1).userId(), "a igual puntuación, quien terminó antes");
    assertTrue(board.entries().stream().noneMatch(entry -> entry.userId().equals(me.id())));
    assertEquals(new DailyLeaderboard.Me("FINISHED", 53, 100, 2, List.of(1, 0, 1)), board.me());

    var stranger = user();
    var forbidden = assertThrows(DailyForbiddenException.class, () -> service.leaderboard(stranger));
    assertEquals("Play today's challenge first", forbidden.getMessage());

    var quitter = user();
    results.save(DailyResultEntity.started(UUID.randomUUID().toString(), quitter.id(), date, "higher-lower", base));
    assertEquals(new DailyLeaderboard.Me("ABANDONED", null, null, null, null), service.leaderboard(quitter).me());
  }

  @Test
  void leaderboardOfAnotherDayNeedsOwnRow() {
    // La partida empezó ayer antes de la medianoche y los resultados se cargan hoy: se pide la clasificación de ayer.
    var yesterday = date.minusDays(1);
    pin(yesterday, "higher-lower", sortedIds(DailyTestRooms.goldenCatalog()));
    var base = Instant.parse("2399-12-31T22:59:00Z");
    var ash = user();
    var started = results.save(DailyResultEntity.started(UUID.randomUUID().toString(), ash.id(), yesterday,
        "higher-lower", base));
    results.finish(started.getId(), 4_200, 3, "[1,1,1]", base.plusSeconds(240));

    assertThrows(DailyForbiddenException.class, () -> service.leaderboard(ash), "hoy no ha jugado");
    var board = service.leaderboard(ash, yesterday);
    assertEquals(yesterday.toString(), board.date());
    assertEquals("higher-lower", board.gameId());
    assertEquals(1, board.total());
    assertEquals(ash.id(), board.entries().getFirst().userId());
    assertEquals(new DailyLeaderboard.Me("FINISHED", 1, 4_200, 3, List.of(1, 1, 1)), board.me());

    var forbidden = assertThrows(DailyForbiddenException.class,
        () -> service.leaderboard(ash, date.minusDays(2)));
    assertEquals("Play today's challenge first", forbidden.getMessage());
    assertThrows(DailyForbiddenException.class, () -> service.leaderboard(ash, date.plusDays(1)));
    assertThrows(DailyForbiddenException.class, () -> service.leaderboard(user(), yesterday),
        "sin fila propia ese día no se ve aunque otros jugaran");
  }

  @Test
  void runBelongsToStartDate() {
    pin("pokedex-distance");
    rooms.setTime(at(date, LocalTime.of(23, 59)));
    var ash = user();
    var view = start(ash);
    assertEquals(date.toString(), view.daily().date());
    playToResults(ash);
    var tomorrow = date.plusDays(1);
    assertEquals(tomorrow, DailyCalendar.dateAt(rooms.clock().now()), "la partida terminó pasada la medianoche");
    var row = row(ash, date);
    assertEquals("FINISHED", row.getStatus());
    assertEquals(date, DailyCalendar.dateAt(row.getStartedAt().toEpochMilli()));
    assertTrue(results.findByUserIdAndDate(ash.id(), tomorrow).isEmpty());
    // El día siguiente ya es otro reto.
    track(tomorrow);
    assertEquals("AVAILABLE", service.overview(ash).status());
  }
}

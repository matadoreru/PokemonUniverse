package es.pokemonuniverse.application.daily;

import es.pokemonuniverse.adapters.out.persistence.DailyChallengeEntity;
import es.pokemonuniverse.adapters.out.persistence.DailyChallengeRepository;
import es.pokemonuniverse.adapters.out.persistence.DailyResultEntity;
import es.pokemonuniverse.adapters.out.persistence.DailyResultRepository;
import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.application.auth.UserIdentityMapper;
import es.pokemonuniverse.application.errors.UnauthorizedException;
import es.pokemonuniverse.application.rooms.DailyLaunch;
import es.pokemonuniverse.application.rooms.RoomCoordinator;
import es.pokemonuniverse.application.rooms.RoomException;
import es.pokemonuniverse.application.rooms.RoomOccupancy;
import es.pokemonuniverse.application.rooms.RoomView;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.daily.CatalogFingerprint;
import es.pokemonuniverse.domain.daily.DailyCalendar;
import es.pokemonuniverse.domain.daily.DailySeed;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.game.engine.infra.Mulberry32;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.pokemon.PinnedPokemonCatalog;
import es.pokemonuniverse.domain.pokemon.Pokemon;
import es.pokemonuniverse.domain.room.DailyRoom;
import io.micronaut.context.annotation.Requires;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.core.type.Argument;
import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * El reto diario: un reto al día (el juego y el catálogo, fijados en {@code DailyChallenge} por la primera partida) y
 * un intento por cuenta y día ({@code DailyResult} {@code STARTED} antes de crear la sala; el índice único arbitra los
 * arranques simultáneos). Nada de esto corre con el lock de una sala tomado: cada llamada al repositorio confirma por sí
 * sola, y el coordinador toma sus locks dentro de {@code occupancyOf}, {@code dailyRunOf} y {@code startDaily}.
 */
@Singleton
@Requires(beans = DailyResultRepository.class)
public class DailyChallengeService {

  public static final String REGISTERED_REQUIRED = "Registered account required";
  public static final String ALREADY_PLAYED = "Daily challenge already played";
  /** El catálogo vigente está vacío (p. ej. antes de la primera sincronización): no se fija el día. */
  public static final String CATALOG_UNAVAILABLE = "Daily challenge unavailable: the Pokémon catalog is empty";
  static final String LEAVE_ROOM_FIRST = "Leave your current room first";
  static final int LEADERBOARD_SIZE = 50;

  static final String AVAILABLE = "AVAILABLE";
  static final String IN_PROGRESS = "IN_PROGRESS";

  private static final Logger LOG = LoggerFactory.getLogger(DailyChallengeService.class);
  /** Orden del catálogo fijado: número de Pokédex y, a igualdad (formas), id. */
  private static final Comparator<Pokemon> PINNED_ORDER = Comparator.comparingInt(Pokemon::nationalDexNumber)
      .thenComparing(Pokemon::id);

  private final RoomCoordinator rooms;
  private final DailyChallengeRepository challenges;
  private final DailyResultRepository results;
  private final UserRepository users;
  private final GameRegistry registry;
  private final Clock clock;
  private final DailyKey key;
  private final JsonMapper json;

  public DailyChallengeService(RoomCoordinator rooms, DailyChallengeRepository challenges,
      DailyResultRepository results, UserRepository users, GameRegistry registry, Clock clock, DailyKey key,
      JsonMapper json) {
    this.rooms = rooms;
    this.challenges = challenges;
    this.results = results;
    this.users = users;
    this.registry = registry;
    this.clock = clock;
    this.key = key;
    this.json = json;
  }

  // ------------------------------------------------------------------------------------------------ start

  /**
   * {@code daily:start}: comprueba la cuenta y la sala, fija el día, guarda el intento como {@code STARTED} y arranca
   * la sala del reto. Los rechazos son {@link RoomException}, cuyo mensaje llega tal cual al ack del {@code /ws}. Si el
   * arranque falla, la fila se borra y la cuenta puede reintentar.
   */
  public RoomView start(AuthUser identity, String connectionId) {
    if (identity.kind() != AuthUser.Kind.USER) throw new RoomException(REGISTERED_REQUIRED);
    // Antes de fijar el día: quien está en otra sala no escribe nada.
    if (rooms.occupancyOf(identity.id()) != RoomOccupancy.NONE) throw new RoomException(LEAVE_ROOM_FIRST);

    long now = clock.now();
    var date = DailyCalendar.dateAt(now);
    long seed = DailySeed.seed(key.bytes(), date);
    var challenge = pinDay(date, seed);
    var game = DailyGames.byId(challenge.getGameId())
        .orElseThrow(() -> new IllegalStateException("Juego del reto desconocido: " + challenge.getGameId()));
    var catalog = PinnedPokemonCatalog.of(rooms.currentPokemonCatalog(), pinnedIds(challenge));
    if (!catalog.missingIds().isEmpty()) {
      LOG.warn("El catálogo fijado del reto {} tiene ids que ya no existen: {}", date, catalog.missingIds());
    }

    var rowId = UUID.randomUUID().toString();
    // El índice único (cuenta, fecha) arbitra los arranques simultáneos: 0 filas es que ya jugó hoy.
    if (results.insertStarted(rowId, identity.id(), date, game.gameId(), Instant.ofEpochMilli(now)) == 0) {
      throw new RoomException(ALREADY_PLAYED);
    }

    var daily = new DailyRoom(rowId, identity.id(), date, game.gameId(), game.roundCount());
    var launch = new DailyLaunch(daily, game.config(defaultConfig(game.gameId())), catalog, new Mulberry32(seed));
    try {
      return rooms.startDaily(identity, connectionId, launch);
    } catch (RuntimeException error) {
      // Compensación solo si el intento no llegó a empezar: si la sala ya arrancó (el fallo vino después, al avisar o
      // al construir la vista), la partida sigue viva y su fila STARTED es la que terminará o se abandonará.
      boolean launched = rooms.dailyRunOf(identity.id()).filter(run -> run.date().equals(date)).isPresent();
      if (!launched) results.deleteStarted(rowId);
      throw error;
    }
  }

  /**
   * Fija el reto de {@code date} si nadie lo ha hecho (juego del sorteo y catálogo vigente) y lee la fila: ante una
   * carrera, o si la fila ya existía, manda la que se guardó primero.
   */
  private DailyChallengeEntity pinDay(LocalDate date, long seed) {
    var existing = challenges.findById(date);
    if (existing.isPresent()) return existing.get();
    var ids = rooms.currentPokemonCatalog().all().stream().sorted(PINNED_ORDER).map(Pokemon::id).toList();
    // Una lista vacía quedaría fijada todo el día: mejor fallar y que la primera partida con catálogo la fije.
    if (ids.isEmpty()) throw new RoomException(CATALOG_UNAVAILABLE);
    challenges.insertIfAbsent(date, DailyGames.ofTheDay(seed).gameId(), toJson(ids), CatalogFingerprint.of(ids));
    return challenges.findById(date).orElseThrow(() -> new IllegalStateException("Sin reto fijado para " + date));
  }

  private JsonNode defaultConfig(String gameId) {
    var manifest = registry.get(gameId).orElseThrow(() -> new RoomException("Unknown game"));
    try {
      return json.writeValueToTree(manifest.defaultConfig());
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  // --------------------------------------------------------------------------------------------- lecturas

  /** {@code GET /api/daily}. Sin fila del día muestra el juego del sorteo, sin escribir nada. */
  public DailyOverview overview(AuthUser user) {
    var userId = registeredId(user);
    long now = clock.now();
    var date = DailyCalendar.dateAt(now);
    var gameId = gameOf(date);
    var game = DailyGames.byId(gameId).orElseThrow(() -> new IllegalStateException("Juego del reto desconocido"));
    var manifest = registry.get(gameId).orElseThrow(() -> new IllegalStateException("Juego sin manifiesto"));
    long players = results.countFinished(date);
    var row = results.findByUserIdAndDate(userId, date).orElse(null);
    var status = statusOf(row, userId);
    DailyOverview.MyResult mine = null;
    if (row != null && DailyResultEntity.FINISHED.equals(row.getStatus())) {
      mine = new DailyOverview.MyResult(row.getScore(), row.getCorrect(), game.roundCount(), rounds(row.getRounds()),
          positionOf(date, row.getScore()), players);
    }
    return new DailyOverview(date.toString(), Instant.ofEpochMilli(DailyCalendar.nextResetAt(now)).toString(), gameId,
        manifest.name(), manifest.icon(), game.roundCount(), players, status, mine);
  }

  /** {@code GET /api/daily/leaderboard}: solo para quien ya tiene su intento de hoy. */
  public DailyLeaderboard leaderboard(AuthUser user) {
    var userId = registeredId(user);
    var date = DailyCalendar.dateAt(clock.now());
    var row = results.findByUserIdAndDate(userId, date).orElseThrow(DailyForbiddenException::new);
    var top = results.topFinished(date, LEADERBOARD_SIZE);
    Map<String, UserEntity> people = new HashMap<>();
    users.findByIdIn(top.stream().map(DailyResultEntity::getUserId).toList())
        .forEach(person -> people.put(person.getId(), person));
    var entries = new ArrayList<DailyLeaderboard.Entry>();
    int position = 0;
    for (int index = 0; index < top.size(); index++) {
      var entry = top.get(index);
      // Las puntuaciones iguales comparten puesto (1, 1, 3): el de la primera fila con esa puntuación.
      if (index == 0 || !top.get(index - 1).getScore().equals(entry.getScore())) position = index + 1;
      var person = people.get(entry.getUserId());
      if (person == null) continue; // cuenta borrada entre las dos lecturas
      entries.add(new DailyLeaderboard.Entry(position, entry.getUserId(), person.getUsername(),
          UserIdentityMapper.avatarFromUser(person.getAvatarType(), person.getAvatarValue(),
              person.getAvatarVersion()),
          entry.getScore(), entry.getCorrect(), entry.getFinishedAt().toString()));
    }
    var status = statusOf(row, userId);
    var me = DailyResultEntity.FINISHED.equals(status)
        ? new DailyLeaderboard.Me(status, positionOf(date, row.getScore()), row.getScore(), row.getCorrect(),
            rounds(row.getRounds()))
        : new DailyLeaderboard.Me(status, null, null, null, null);
    return new DailyLeaderboard(date.toString(), row.getGameId(), results.countFinished(date), entries, me);
  }

  private static String registeredId(AuthUser user) {
    if (user.kind() != AuthUser.Kind.USER) throw new UnauthorizedException(REGISTERED_REQUIRED);
    return user.id();
  }

  /** El juego de hoy: el de la fila de {@code DailyChallenge} si existe y, si no, el del sorteo. */
  private String gameOf(LocalDate date) {
    return challenges.findById(date).map(DailyChallengeEntity::getGameId)
        .orElseGet(() -> DailyGames.ofTheDay(DailySeed.seed(key.bytes(), date)).gameId());
  }

  /**
   * Estado propio: sin fila, {@code AVAILABLE}; una fila {@code STARTED} es {@code IN_PROGRESS} si su partida sigue viva
   * en memoria (aunque ya esté en resultados y la escritura pendiente) y {@code ABANDONED} si no.
   */
  private String statusOf(@Nullable DailyResultEntity row, String userId) {
    if (row == null) return AVAILABLE;
    if (!DailyResultEntity.STARTED.equals(row.getStatus())) return row.getStatus();
    var live = rooms.dailyRunOf(userId).filter(run -> run.date().equals(row.getDate()));
    return live.isPresent() ? IN_PROGRESS : DailyResultEntity.ABANDONED;
  }

  private int positionOf(LocalDate date, int score) {
    return 1 + (int) results.countFinishedAbove(date, score);
  }

  private List<String> pinnedIds(DailyChallengeEntity challenge) {
    try {
      return json.readValue(challenge.getPokemonIds(), Argument.listOf(String.class));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private List<Integer> rounds(String text) {
    try {
      return json.readValue(text, Argument.listOf(Integer.class));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private String toJson(List<String> ids) {
    try {
      return json.writeValueAsString(ids);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

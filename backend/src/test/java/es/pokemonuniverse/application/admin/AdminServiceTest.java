package es.pokemonuniverse.application.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.application.rooms.AdminActiveRoom;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.UserRole;
import es.pokemonuniverse.domain.room.PresenceStatus;
import es.pokemonuniverse.domain.room.RoomPhase;
import es.pokemonuniverse.domain.room.RoomRole;
import io.micronaut.core.annotation.Nullable;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;

/** Lógica de {@code admin/routes.ts} sin HTTP ni BD: resumen, salas activas en memoria y paginación. */
class AdminServiceTest {

  /** Registros falsos: cuentan con {@code >=} como la consulta real y devuelven filas numeradas. */
  static class FakeRecords implements AdminRecords {
    final List<Instant> interrupted = new ArrayList<>();
    final List<String> fetches = new ArrayList<>();
    long total;
    Map<String, UserRole> roles = Map.of();

    @Override
    public Optional<UserRole> roleOf(String userId) {
      return Optional.ofNullable(roles.get(userId));
    }

    @Override
    public long countUsers() {
      return 7;
    }

    @Override
    public long countInterruptedGamesSince(Instant since) {
      return interrupted.stream().filter(startedAt -> !startedAt.isBefore(since)).count();
    }

    @Override
    public long countRooms(String search, @Nullable String status) {
      return total;
    }

    @Override
    public List<AdminRoomHistoryItem> rooms(String search, @Nullable String status, int offset, int limit) {
      fetches.add("rooms:" + offset + ":" + limit);
      return LongStream.range(offset, Math.min(total, offset + limit))
          .mapToObj(i -> new AdminRoomHistoryItem("r" + i, "CODE" + i, "Host", null, 8, "CLOSED", null, 0,
              "2026-01-01T00:00:00.000Z", null))
          .toList();
    }

    @Override
    public long countGames(String search, @Nullable String status, @Nullable String gameId) {
      return 1;
    }

    @Override
    public List<GameRow> games(String search, @Nullable String status, @Nullable String gameId, int offset,
        int limit) {
      return List.of(new GameRow("g1", "ABCDEF", "no-existe", 2, "COMPLETED", "2026-01-01T00:00:00.000Z", null,
          List.of()));
    }

    @Override
    public long countUsers(String search, @Nullable String role) {
      return 0;
    }

    @Override
    public List<AdminUserItem> users(String search, @Nullable String role, int offset, int limit) {
      fetches.add("users");
      return List.of();
    }
  }

  private static AdminActiveRoom room(String code, @Nullable String gameId, String host, String... players) {
    var participants = new ArrayList<AdminActiveRoom.Participant>();
    for (var player : players) {
      participants.add(new AdminActiveRoom.Participant(player, player, AuthUser.Kind.GUEST, PresenceStatus.CONNECTED,
          RoomRole.MEMBER));
    }
    return new AdminActiveRoom(code, code, RoomPhase.LOBBY, gameId, null, 1, 1, 8, host, "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z", participants);
  }

  private final FakeRecords records = new FakeRecords();
  private List<AdminActiveRoom> live = List.of();

  private AdminService service(String now, String zone) {
    return new AdminService(records, () -> live, new GameRegistry(List.of()), () -> Instant.parse(now).toEpochMilli(),
        ZoneId.of(zone));
  }

  @Test
  void interruptedTodayStartsAtLocalMidnightOfTheConfiguredZone() {
    // 23:30 UTC del 3 de noviembre = 00:30 del 4 en Madrid (UTC+1): el día empieza a las 23:00 UTC.
    records.interrupted.add(Instant.parse("2026-11-03T22:59:59.999Z"));
    records.interrupted.add(Instant.parse("2026-11-03T23:00:00.000Z"));
    records.interrupted.add(Instant.parse("2026-11-03T23:29:00.000Z"));
    assertEquals(2, service("2026-11-03T23:30:00Z", "Europe/Madrid").summary().interruptedToday());
    // En UTC sigue siendo el día 3: cuentan las tres.
    assertEquals(3, service("2026-11-03T23:30:00Z", "UTC").summary().interruptedToday());
  }

  @Test
  void summaryCountsLiveRoomsAndGames() {
    live = List.of(room("AAAAAA", "higher-lower", "Ash"), room("BBBBBB", null, "Misty"));
    var summary = service("2026-11-03T10:00:00.5Z", "UTC").summary();
    assertEquals(new AdminSummary(2, 1, 7, 0, "2026-11-03T10:00:00.500Z"), summary);
  }

  @Test
  void activeRoomsSearchIsCaseInsensitiveWithSpanishLocaleAndPaged() {
    var rooms = new ArrayList<AdminActiveRoom>();
    for (int i = 0; i < 25; i++) rooms.add(room("CODE" + (char) ('A' + i), null, "Host" + i));
    rooms.add(room("ZZZZZZ", null, "Ñandú", "Íñigo"));
    live = rooms;
    var service = service("2026-11-03T10:00:00Z", "UTC");
    var first = service.activeRooms(1, "");
    assertEquals(20, first.items().size());
    assertEquals(26, first.total());
    assertEquals("CODEA", first.items().getFirst().code());
    var second = service.activeRooms(2, "");
    assertEquals(6, second.items().size());
    assertEquals(List.of("ZZZZZZ"), service.activeRooms(1, "ÑANDÚ").items().stream().map(AdminActiveRoom::code).toList());
    assertEquals(List.of("ZZZZZZ"), service.activeRooms(1, "íñi").items().stream().map(AdminActiveRoom::code).toList());
    assertEquals(List.of("CODEC"), service.activeRooms(1, "codec").items().stream().map(AdminActiveRoom::code).toList());
    var beyond = service.activeRooms(9_007_199_254_740_991L, "");
    assertTrue(beyond.items().isEmpty());
    assertEquals(9_007_199_254_740_991L, beyond.page());
    assertEquals(26, beyond.total());
  }

  @Test
  void pagesBeyondTheTotalSkipTheFetch() {
    records.total = 21;
    var service = service("2026-11-03T10:00:00Z", "UTC");
    assertEquals(1, service.rooms(2, "", null).items().size());
    assertTrue(service.rooms(3, "", null).items().isEmpty());
    assertTrue(service.rooms(9_007_199_254_740_991L, "", null).items().isEmpty());
    assertTrue(service.users(1, "", null).items().isEmpty());
    assertEquals(List.of("rooms:20:20"), records.fetches);
  }

  @Test
  void gameNameFallsBackToTheId() {
    var game = service("2026-11-03T10:00:00Z", "UTC").games(1, "", null, null).items().getFirst();
    assertEquals("no-existe", game.gameName());
  }

  @Test
  void onlyAdministratorsPass() {
    records.roles = Map.of("admin", UserRole.ADMIN, "user", UserRole.USER);
    var service = service("2026-11-03T10:00:00Z", "UTC");
    assertTrue(service.isAdmin("admin"));
    assertFalse(service.isAdmin("user"));
    assertFalse(service.isAdmin("gone"));
  }
}

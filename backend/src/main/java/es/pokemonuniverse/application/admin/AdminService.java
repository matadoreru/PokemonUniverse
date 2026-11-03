package es.pokemonuniverse.application.admin;

import es.pokemonuniverse.application.rooms.AdminActiveRoom;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.identity.UserRole;
import es.pokemonuniverse.domain.time.IsoTimestamps;
import io.micronaut.core.annotation.Nullable;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;

/**
 * Lógica de {@code admin/routes.ts}: el resumen, las salas activas en memoria y las listas paginadas del historial.
 *
 * <p>{@code interruptedToday} cuenta desde la medianoche local de {@code zone}. Node usa la zona del proceso
 * ({@code setHours(0, 0, 0, 0)}), que en los contenedores es la de {@code TZ} (UTC si no se define); el bean usa la
 * zona por defecto de la JVM, que lee la misma variable, y las pruebas fijan una explícita.
 *
 * <p>Una página fuera de rango devuelve {@code items: []} con la página pedida sin consultar las filas (Zod admite
 * páginas hasta {@code 2^53 - 1}, que no caben en el {@code OFFSET} entero de JPA).
 */
public class AdminService {

  private static final Locale ES = Locale.forLanguageTag("es");

  private final AdminRecords records;
  private final Supplier<List<AdminActiveRoom>> activeRooms;
  private final GameRegistry games;
  private final Clock clock;
  private final ZoneId zone;

  public AdminService(AdminRecords records, Supplier<List<AdminActiveRoom>> activeRooms, GameRegistry games,
      Clock clock, ZoneId zone) {
    this.records = records;
    this.activeRooms = activeRooms;
    this.games = games;
    this.clock = clock;
    this.zone = zone;
  }

  /** {@code requireAdmin}: la cuenta existe y su rol actual es ADMIN. */
  public boolean isAdmin(String userId) {
    return records.roleOf(userId).filter(role -> role == UserRole.ADMIN).isPresent();
  }

  public AdminSummary summary() {
    var rooms = activeRooms.get();
    var now = Instant.ofEpochMilli(clock.now());
    var midnight = LocalDate.ofInstant(now, zone).atStartOfDay(zone).toInstant();
    var inProgress = (int) rooms.stream().filter(room -> room.gameId() != null).count();
    return new AdminSummary(rooms.size(), inProgress, records.countUsers(),
        records.countInterruptedGamesSince(midnight), IsoTimestamps.millis(now));
  }

  /**
   * Búsqueda en memoria como {@code toLocaleLowerCase('es').includes(needle)} sobre el código, el host o cualquier
   * participante, en el orden del coordinador.
   */
  public AdminPage<AdminActiveRoom> activeRooms(long page, String search) {
    var needle = search.toLowerCase(ES);
    var filtered = activeRooms.get().stream()
        .filter(room -> needle.isEmpty()
            || room.code().toLowerCase(ES).contains(needle)
            || room.hostDisplayName().toLowerCase(ES).contains(needle)
            || room.participants().stream().anyMatch(p -> p.displayName().toLowerCase(ES).contains(needle)))
        .toList();
    long start = offset(page);
    var items = start >= filtered.size() ? List.<AdminActiveRoom>of()
        : filtered.subList((int) start, (int) Math.min(filtered.size(), start + AdminPage.PAGE_SIZE));
    return new AdminPage<>(List.copyOf(items), page, filtered.size());
  }

  public AdminPage<AdminRoomHistoryItem> rooms(long page, String search, @Nullable String status) {
    var total = records.countRooms(search, status);
    return page(page, total, offset -> records.rooms(search, status, offset, AdminPage.PAGE_SIZE));
  }

  public AdminPage<AdminGameHistoryItem> games(long page, String search, @Nullable String status,
      @Nullable String gameId) {
    var total = records.countGames(search, status, gameId);
    return page(page, total, offset -> records.games(search, status, gameId, offset, AdminPage.PAGE_SIZE).stream()
        .map(row -> new AdminGameHistoryItem(row.id(), row.roomCode(), row.gameId(),
            games.get(row.gameId()).map(GameManifest::name).orElse(row.gameId()), row.playerCount(), row.status(),
            row.startedAt(), row.endedAt(), row.participants()))
        .toList());
  }

  public AdminPage<AdminUserItem> users(long page, String search, @Nullable String role) {
    var total = records.countUsers(search, role);
    return page(page, total, offset -> records.users(search, role, offset, AdminPage.PAGE_SIZE));
  }

  private static long offset(long page) {
    return (page - 1) * AdminPage.PAGE_SIZE;
  }

  private static <T> AdminPage<T> page(long page, long total, java.util.function.IntFunction<List<T>> fetch) {
    long offset = offset(page);
    if (offset >= total) return new AdminPage<>(List.of(), page, total);
    return new AdminPage<>(fetch.apply((int) offset), page, total);
  }
}
